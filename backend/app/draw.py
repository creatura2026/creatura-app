"""Algorithme de tirage des boosters, sans base de données ni framework.

Fonctions pures : tout ce dont elles ont besoin leur est passé (créatures tirables, poids,
générateur aléatoire). Elles se testent et se simulent seules ; le service
`app.controllers.booster` les branche sur la base.

Règles
------
- Quatre raretés, chacune avec un poids réglable (70 / 20 / 8 / 2 par défaut). Une carte se
  tire en deux temps : la rareté selon les poids, puis une créature au hasard (uniforme) parmi
  celles de cette rareté.
- Seules les légendaires ont un stock. Une légendaire épuisée sort du tirage ; quand toutes le
  sont, le poids des légendaires disparaît et les autres raretés se partagent le tirage.
- Exclusion : un booster contient au plus une carte rare OU légendaire. Dès qu'une des deux est
  tirée, les cartes suivantes se tirent parmi commune et peu commune, avec les mêmes poids
  renormalisés sur leur total (70 et 20 sur 90).
- Premier booster d'un joueur : une rare garantie (motif GARANTIE_PREMIER_BOOSTER), qui compte
  pour l'exclusion.
- Doublons autorisés, dans la limite du stock restant d'une légendaire.
- La carte la plus rare est révélée en dernier.

Les codes de rareté sont ceux de la base (COMMUN…) ; `app.models.Rarete` est une enum `str`
dont les valeurs sont ces mêmes chaînes.
"""

from __future__ import annotations

import random
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

COMMUN, PEU_COMMUN, RARE, LEGENDAIRE = "COMMUN", "PEU_COMMUN", "RARE", "LEGENDAIRE"
RARITIES = (COMMUN, PEU_COMMUN, RARE, LEGENDAIRE)  # de la plus commune à la plus rare
RANK = {r: i for i, r in enumerate(RARITIES)}
PREMIUM = frozenset({RARE, LEGENDAIRE})  # au plus une carte de ces raretés par booster
DEFAULT_WEIGHTS = {COMMUN: 70, PEU_COMMUN: 20, RARE: 8, LEGENDAIRE: 2}

DRAW = "TIRAGE"
FIRST_BOOSTER_GUARANTEE = "GARANTIE_PREMIER_BOOSTER"


@dataclass(frozen=True)
class Candidate:
    """Une créature du catalogue. `stock` : exemplaires restants, None = illimité."""

    id: int
    rarity: str
    stock: int | None = None


@dataclass(frozen=True)
class DrawnCard:
    creature_id: int
    rarity: str
    reason: str = DRAW


def _drawable(candidates: Iterable[Candidate], stock_left: Mapping[int, int]) -> dict[str, list[Candidate]]:
    """Créatures encore tirables, par rareté."""
    pool: dict[str, list[Candidate]] = {r: [] for r in RARITIES}
    for c in candidates:
        if c.stock is None or stock_left[c.id] > 0:
            pool[c.rarity].append(c)
    return pool


def _active_weights(
    weights: Mapping[str, int], pool: Mapping[str, Sequence[Candidate]], premium_taken: bool
) -> dict[str, int]:
    """Raretés tirables pour la prochaine carte, avec leur poids (non renormalisé)."""
    return {
        r: weights.get(r, 0)
        for r in RARITIES
        if weights.get(r, 0) > 0 and pool[r] and not (premium_taken and r in PREMIUM)
    }


def reveal_order(cards: Sequence[DrawnCard]) -> list[DrawnCard]:
    """La carte la plus rare passe en dernier ; les autres gardent l'ordre du tirage."""
    if not cards:
        return []
    rarest = max(range(len(cards)), key=lambda i: (RANK[cards[i].rarity], -i))
    return [c for i, c in enumerate(cards) if i != rarest] + [cards[rarest]]


def draw_booster(
    candidates: Sequence[Candidate],
    weights: Mapping[str, int],
    count: int,
    *,
    first_booster: bool = False,
    rng: random.Random | None = None,
) -> list[DrawnCard]:
    """Tire jusqu'à `count` cartes et les renvoie dans l'ordre de révélation.

    Moins de `count` cartes seulement si plus rien n'est tirable (poids à 0 ou stocks épuisés) ;
    liste vide si rien ne l'est.
    """
    rng = rng or random.SystemRandom()
    stock_left = {c.id: c.stock for c in candidates if c.stock is not None}
    cards: list[DrawnCard] = []
    premium_taken = False

    def take(candidate: Candidate, reason: str) -> None:
        nonlocal premium_taken
        if candidate.stock is not None:
            stock_left[candidate.id] -= 1
        premium_taken = premium_taken or candidate.rarity in PREMIUM
        cards.append(DrawnCard(candidate.id, candidate.rarity, reason))

    if first_booster and count > 0:
        rares = _drawable(candidates, stock_left)[RARE]
        if rares:  # sans aucune rare au catalogue, le premier booster est un booster normal
            take(rng.choice(rares), FIRST_BOOSTER_GUARANTEE)

    while len(cards) < count:
        pool = _drawable(candidates, stock_left)
        active = _active_weights(weights, pool, premium_taken)
        if not active:
            break
        rarity = rng.choices(list(active), weights=list(active.values()))[0]
        take(rng.choice(pool[rarity]), DRAW)

    return reveal_order(cards)


def expected_card_rates(
    weights: Mapping[str, int], available: Iterable[str], count: int
) -> dict[str, float]:
    """Probabilité qu'une carte d'un booster normal soit de chaque rareté (somme = 1).

    Calcul exact, règle d'exclusion comprise : on suit carte après carte la probabilité qu'une
    rare ou une légendaire soit déjà sortie. `available` : raretés qui ont au moins une créature
    tirable (une rareté sans créature, ou dont toutes les légendaires sont épuisées, sort du
    tirage). Le stock n'est pas suivi au fil du booster : les légendaires sont supposées
    disponibles pendant tout le booster. La garantie du premier booster n'est pas comptée.

    Avec 70/20/8/2 et 5 cartes : 6,6 % de rares et 1,6 % de légendaires par carte.
    """
    available = set(available)
    rates = {r: 0.0 for r in RARITIES}
    if count <= 0:
        return rates
    open_w = {r: weights.get(r, 0) for r in RARITIES if r in available and weights.get(r, 0) > 0}
    closed_w = {r: w for r, w in open_w.items() if r not in PREMIUM}
    open_total, closed_total = sum(open_w.values()), sum(closed_w.values())
    if open_total == 0:
        return rates

    p_open = 1.0  # probabilité qu'aucune rare ni légendaire ne soit encore sortie
    expected = {r: 0.0 for r in RARITIES}
    for _ in range(count):
        for r, w in open_w.items():
            expected[r] += p_open * w / open_total
        if closed_total:
            for r, w in closed_w.items():
                expected[r] += (1 - p_open) * w / closed_total
        p_open *= 1 - sum(w for r, w in open_w.items() if r in PREMIUM) / open_total

    drawn = sum(expected.values())  # < count si plus rien n'est tirable après une rare
    return {r: expected[r] / drawn if drawn else 0.0 for r in RARITIES}
