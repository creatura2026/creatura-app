"""Algorithme de tirage (app/draw.py) : fonction pure, testée sans base de données.

Les tests statistiques utilisent un générateur à graine fixe : ils sont reproductibles.
"""

import random
from collections import Counter

import pytest

from app.draw import (
    COMMUN,
    DEFAULT_WEIGHTS,
    DRAW,
    FIRST_BOOSTER_GUARANTEE,
    LEGENDAIRE,
    PEU_COMMUN,
    PREMIUM,
    RARE,
    RARITIES,
    Candidate,
    DrawnCard,
    draw_booster,
    expected_card_rates,
    reveal_order,
)

# Catalogue réel : 33 communes, 32 peu communes, 17 rares, 2 légendaires de 50 exemplaires.
CATALOGUE = (
    [Candidate(i, COMMUN) for i in range(1, 34)]
    + [Candidate(i, PEU_COMMUN) for i in range(34, 66)]
    + [Candidate(i, RARE) for i in range(66, 83)]
    + [Candidate(83, LEGENDAIRE, 50), Candidate(84, LEGENDAIRE, 50)]
)
# Légendaires inépuisables, pour les simulations longues.
UNLIMITED = [Candidate(c.id, c.rarity) if c.rarity != LEGENDAIRE else Candidate(c.id, c.rarity, 10**9) for c in CATALOGUE]


def rng(seed: int = 7) -> random.Random:
    return random.Random(seed)


def rarities(cards) -> list[str]:
    return [c.rarity for c in cards]


def simulate(n: int, count: int = 5, weights=DEFAULT_WEIGHTS, seed: int = 1) -> list[list[DrawnCard]]:
    g = rng(seed)
    return [draw_booster(UNLIMITED, weights, count, rng=g) for _ in range(n)]


# ── Tirage en deux temps : rareté selon les poids, puis créature ──────────────


def test_booster_has_the_requested_number_of_cards():
    for count in (3, 5, 10):
        assert len(draw_booster(CATALOGUE, DEFAULT_WEIGHTS, count, rng=rng())) == count


def test_rarity_follows_weights():
    only_uncommon = {COMMUN: 0, PEU_COMMUN: 1, RARE: 0, LEGENDAIRE: 0}
    assert set(rarities(draw_booster(CATALOGUE, only_uncommon, 10, rng=rng()))) == {PEU_COMMUN}


def test_creature_is_uniform_within_its_rarity():
    two = [Candidate(1, COMMUN), Candidate(2, COMMUN)]
    g = rng()
    counts = Counter(c.creature_id for _ in range(2000) for c in draw_booster(two, DEFAULT_WEIGHTS, 5, rng=g))
    assert abs(counts[1] / (counts[1] + counts[2]) - 0.5) < 0.03


def test_duplicates_are_allowed():
    cards = draw_booster([Candidate(1, COMMUN)], DEFAULT_WEIGHTS, 5, rng=rng())
    assert [c.creature_id for c in cards] == [1] * 5


# ── Exclusion : au plus une rare ou une légendaire par booster ───────────────


def test_at_most_one_rare_or_legendary_per_booster():
    premium_heavy = {COMMUN: 1, PEU_COMMUN: 1, RARE: 50, LEGENDAIRE: 50}
    g = rng()
    for _ in range(2000):
        cards = draw_booster(UNLIMITED, premium_heavy, 10, rng=g)
        assert len(cards) == 10
        assert sum(c.rarity in PREMIUM for c in cards) == 1


def test_after_a_rare_weights_are_renormalized_on_common_and_uncommon():
    """Après une rare ou une légendaire : 70 et 20 sur 90, soit 77,8 % et 22,2 %."""
    after_premium = Counter()
    for cards in simulate(20_000, count=10, weights={COMMUN: 70, PEU_COMMUN: 20, RARE: 800, LEGENDAIRE: 200}):
        # La rare ou légendaire (révélée en dernier) sort presque toujours en premier avec ces poids.
        after_premium.update(c.rarity for c in cards[:-1])
    total = sum(after_premium.values())
    assert set(after_premium) <= {COMMUN, PEU_COMMUN}
    assert abs(after_premium[COMMUN] / total - 70 / 90) < 0.01


def test_observed_rates_match_the_specification():
    """5 cartes, 70/20/8/2 : ~6,6 % de rares, ~1,6 % de légendaires ; une rare dans un booster sur
    trois, une légendaire dans un sur douze. Ce n'est pas un bug : c'est l'effet de l'exclusion."""
    boosters = simulate(40_000)
    cards = Counter(c.rarity for b in boosters for c in b)
    total = sum(cards.values())
    assert abs(cards[RARE] / total - 0.066) < 0.003
    assert abs(cards[LEGENDAIRE] / total - 0.016) < 0.002
    assert abs(sum(any(c.rarity == RARE for c in b) for b in boosters) / len(boosters) - 1 / 3) < 0.01
    assert abs(sum(any(c.rarity == LEGENDAIRE for c in b) for b in boosters) / len(boosters) - 1 / 12) < 0.005


# ── Premier booster : une rare garantie ──────────────────────────────────────


def test_first_booster_has_exactly_one_guaranteed_rare():
    g = rng()
    for _ in range(500):
        cards = draw_booster(CATALOGUE, DEFAULT_WEIGHTS, 5, first_booster=True, rng=g)
        assert len(cards) == 5
        assert [c.rarity for c in cards if c.rarity in PREMIUM] == [RARE]  # jamais de légendaire en plus
        assert [c.reason for c in cards].count(FIRST_BOOSTER_GUARANTEE) == 1
        assert cards[-1].rarity == RARE and cards[-1].reason == FIRST_BOOSTER_GUARANTEE
        assert all(c.reason == DRAW for c in cards[:-1])


def test_first_booster_without_any_rare_is_a_normal_booster():
    cards = draw_booster([Candidate(1, COMMUN)], DEFAULT_WEIGHTS, 3, first_booster=True, rng=rng())
    assert rarities(cards) == [COMMUN] * 3 and {c.reason for c in cards} == {DRAW}


# ── Ordre de révélation ───────────────────────────────────────────────────


def test_rarest_card_is_revealed_last_others_keep_their_order():
    drawn = [DrawnCard(1, COMMUN), DrawnCard(2, RARE), DrawnCard(3, PEU_COMMUN), DrawnCard(4, COMMUN)]
    assert [c.creature_id for c in reveal_order(drawn)] == [1, 3, 4, 2]
    # À rareté égale, la première tirée est révélée en dernier.
    drawn = [DrawnCard(1, PEU_COMMUN), DrawnCard(2, COMMUN), DrawnCard(3, PEU_COMMUN)]
    assert [c.creature_id for c in reveal_order(drawn)] == [2, 3, 1]


def test_every_booster_ends_with_its_rarest_card():
    for cards in simulate(2000):
        ranks = [RARITIES.index(c.rarity) for c in cards]
        assert ranks[-1] == max(ranks)


# ── Stock des légendaires ──────────────────────────────────────────────────


def test_exhausted_legendary_leaves_the_draw():
    catalogue = [Candidate(1, COMMUN), Candidate(2, LEGENDAIRE, 0), Candidate(3, LEGENDAIRE, 4)]
    only_legendary = {COMMUN: 1, PEU_COMMUN: 0, RARE: 0, LEGENDAIRE: 1000}
    g = rng()
    legendaries = Counter(
        c.creature_id for _ in range(300) for c in draw_booster(catalogue, only_legendary, 3, rng=g) if c.rarity == LEGENDAIRE
    )
    assert legendaries[2] == 0 and legendaries[3] > 0


def test_weight_of_exhausted_legendaries_is_shared_by_the_other_rarities():
    catalogue = [Candidate(1, COMMUN), Candidate(2, LEGENDAIRE, 0)]
    cards = draw_booster(catalogue, {COMMUN: 1, PEU_COMMUN: 0, RARE: 0, LEGENDAIRE: 1000}, 5, rng=rng())
    assert rarities(cards) == [COMMUN] * 5


def test_a_booster_never_takes_more_legendaries_than_the_stock():
    """Doublons autorisés, mais pas au-delà du stock restant (ici sans l'exclusion pour le vérifier :
    les légendaires sont les seules cartes tirables)."""
    catalogue = [Candidate(1, LEGENDAIRE, 2)]
    cards = draw_booster(catalogue, {COMMUN: 0, PEU_COMMUN: 0, RARE: 0, LEGENDAIRE: 1}, 10, rng=rng())
    assert len(cards) == 1  # une légendaire, puis plus rien de tirable (exclusion)
    assert draw_booster([Candidate(1, LEGENDAIRE, 0)], DEFAULT_WEIGHTS, 5, rng=rng()) == []


def test_nothing_drawable_gives_an_empty_booster():
    assert draw_booster([], DEFAULT_WEIGHTS, 5, rng=rng()) == []
    assert draw_booster(CATALOGUE, {COMMUN: 0, PEU_COMMUN: 0, RARE: 0, LEGENDAIRE: 0}, 5, rng=rng()) == []


# ── Taux attendus (calcul exact) ─────────────────────────────────────────────


def test_expected_rates_specification_values():
    rates = expected_card_rates(DEFAULT_WEIGHTS, RARITIES, 5)
    assert sum(rates.values()) == pytest.approx(1)
    assert rates[RARE] == pytest.approx(0.0655, abs=1e-4)
    assert rates[LEGENDAIRE] == pytest.approx(0.0164, abs=1e-4)


def test_expected_rates_with_one_card_are_the_raw_weights():
    rates = expected_card_rates(DEFAULT_WEIGHTS, RARITIES, 1)
    assert rates == pytest.approx({COMMUN: 0.70, PEU_COMMUN: 0.20, RARE: 0.08, LEGENDAIRE: 0.02})


def test_expected_rates_without_legendaries_left():
    rates = expected_card_rates(DEFAULT_WEIGHTS, {COMMUN, PEU_COMMUN, RARE}, 1)
    assert rates[LEGENDAIRE] == 0
    assert rates[RARE] == pytest.approx(8 / 98)


@pytest.mark.parametrize("count", [3, 5, 10])
def test_expected_rates_match_a_simulation(count):
    cards = Counter(c.rarity for b in simulate(20_000, count=count, seed=count) for c in b)
    total = sum(cards.values())
    for rarity, rate in expected_card_rates(DEFAULT_WEIGHTS, RARITIES, count).items():
        assert cards[rarity] / total == pytest.approx(rate, abs=0.006)
