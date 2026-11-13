import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from zoneinfo import ZoneInfo

from conftest import (
    API,
    PASSWORD,
    assert_stock_invariant,
    auth_headers,
    booster_history,
    give,
    login,
    not_first_booster,
    only_creatures,
    problem,
    register_and_login,
    set_booster_size,
    pass_midnight,
    set_stock,
    set_weights,
)

from app.controllers import booster
from app.database import SessionLocal
from app.errors import Conflict
from app.models import MotifTirage, Rarete, Utilisateur

PARIS = ZoneInfo("Europe/Paris")
RANK = {"COMMON": 1, "UNCOMMON": 2, "RARE": 3, "LEGENDARY": 4}
ONLY_LEGENDARIES = {"COMMUN": 0, "PEU_COMMUN": 0, "RARE": 0, "LEGENDAIRE": 1}


def _open_concurrently(user_ids: list) -> list:
    """Chaque joueur ouvre un booster au même instant, chacun dans sa propre connexion."""
    barrier = Barrier(len(user_ids))

    def attempt(user_id):
        with SessionLocal() as db:
            user = db.get(Utilisateur, user_id)
            barrier.wait()
            try:
                return len(booster.open_booster(db, user).cards)
            except Conflict:
                return "conflict"

    with ThreadPoolExecutor(len(user_ids)) as pool:
        return list(pool.map(attempt, user_ids))


def test_daily_booster(client):
    p = register_and_login(client, "Lina")
    h = p["headers"]

    today = client.get(f"{API}/me/boosters/today", headers=h).json()
    assert today["available"] is True and today["cardsPerBooster"] == 5 and today["booster"] is None
    # Prochain minuit, heure de Paris, exprimé en UTC.
    next_at = datetime.fromisoformat(today["nextAvailableAt"]).astimezone(PARIS)
    assert (next_at.hour, next_at.minute) == (0, 0)
    assert next_at.date() == datetime.fromisoformat(today["claimDate"]).date() + timedelta(days=1)

    r = client.post(f"{API}/me/boosters", headers=h)
    assert r.status_code == 201
    opened = r.json()
    uuid.UUID(opened["id"])
    assert opened["claimDate"] == today["claimDate"] and len(opened["cards"]) == 5
    assert set(opened["cards"][0]) == {"creature", "isNew"}
    assert set(opened["cards"][0]["creature"]) == {"id", "name", "family", "rarity", "imageUrl"}

    # Une nouvelle demande le même jour ne donne aucune carte.
    problem(client.post(f"{API}/me/boosters", headers=h), 409, "BOOSTER_ALREADY_CLAIMED")

    today = client.get(f"{API}/me/boosters/today", headers=h).json()
    assert today["available"] is False and today["booster"] is None

    me = client.get(f"{API}/me", headers=h).json()
    assert me["progress"]["totalCards"] == 5 and me["boosterAvailableToday"] is False
    assert_stock_invariant()


def test_first_booster_has_a_guaranteed_rare_revealed_last(client):
    p = register_and_login(client, "Lina")
    cards = client.post(f"{API}/me/boosters", headers=p["headers"]).json()["cards"]
    codes = [c["creature"]["rarity"]["code"] for c in cards]
    assert codes[-1] == "RARE" and codes.count("RARE") == 1 and "LEGENDARY" not in codes

    motifs = [row.motif for row in booster_history(p["id"])]
    assert motifs.count(MotifTirage.GARANTIE_PREMIER_BOOSTER) == 1
    assert booster_history(p["id"])[-1].motif == MotifTirage.GARANTIE_PREMIER_BOOSTER


def test_only_the_first_booster_is_guaranteed(client):
    p = register_and_login(client, "Lina")
    not_first_booster(p["id"])
    set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=0)
    cards = client.post(f"{API}/me/boosters", headers=p["headers"]).json()["cards"]
    assert {c["creature"]["rarity"]["code"] for c in cards} == {"COMMON"}
    assert {row.motif for row in booster_history(p["id"])} == {MotifTirage.TIRAGE}


def test_history_records_every_card(client):
    p = register_and_login(client, "Lina")
    opened = client.post(f"{API}/me/boosters", headers=p["headers"]).json()
    rows = booster_history(p["id"])
    assert [r.position for r in rows] == [1, 2, 3, 4, 5]
    assert {str(r.booster_id) for r in rows} == {opened["id"]}
    assert {r.jour.isoformat() for r in rows} == {opened["claimDate"]}
    assert [str(r.creature_id) for r in rows] == [c["creature"]["id"] for c in opened["cards"]]
    assert [Rarete(r.rarete).value for r in rows] == [
        {"COMMON": "COMMUN", "UNCOMMON": "PEU_COMMUN", "RARE": "RARE", "LEGENDARY": "LEGENDAIRE"}[
            c["creature"]["rarity"]["code"]
        ]
        for c in opened["cards"]
    ]


def test_one_rare_or_legendary_at_most_and_it_comes_last(client):
    set_weights(COMMUN=1, PEU_COMMUN=1, RARE=1000, LEGENDAIRE=1000)
    set_booster_size(10)
    players = [register_and_login(client, f"Joueur{i}") for i in range(5)]
    not_first_booster(*(p["id"] for p in players))
    for p in players:
        codes = [c["creature"]["rarity"]["code"] for c in client.post(f"{API}/me/boosters", headers=p["headers"]).json()["cards"]]
        assert len(codes) == 10
        assert sum(code in ("RARE", "LEGENDARY") for code in codes) == 1
        assert RANK[codes[-1]] == max(RANK[c] for c in codes)
    assert_stock_invariant()


def test_new_cards_are_flagged(client):
    set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=0)
    only_creatures("COMMUN", ["Moussou"])  # toutes les cartes seront des Moussou
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    not_first_booster(a["id"], b["id"])
    give(a["id"], "Moussou", 1)

    cards = client.post(f"{API}/me/boosters", headers=a["headers"]).json()["cards"]
    assert [c["creature"]["name"] for c in cards] == ["Moussou"] * 5  # doublons autorisés
    assert not any(c["isNew"] for c in cards)  # déjà possédée

    # Seul le premier exemplaire est nouveau : les suivants sont des doublons du même booster.
    cards = client.post(f"{API}/me/boosters", headers=b["headers"]).json()["cards"]
    assert [c["isNew"] for c in cards] == [True, False, False, False, False]


def test_booster_size_follows_admin_setting(client, admin_headers):
    h = register_and_login(client, "Lina")["headers"]
    client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": 3}, headers=admin_headers)

    # Pris en compte au prochain minuit seulement : les boosters du jour gardent 5 cartes.
    assert client.get(f"{API}/me/boosters/today", headers=h).json()["cardsPerBooster"] == 5
    pass_midnight()
    assert client.get(f"{API}/me/boosters/today", headers=h).json()["cardsPerBooster"] == 3
    assert len(client.post(f"{API}/me/boosters", headers=h).json()["cards"]) == 3


def test_collection_persists_after_reconnection(client):
    """Preuve qualité 01 : après reconnexion, la collection est conservée."""
    p = register_and_login(client, "Lina")
    client.post(f"{API}/me/boosters", headers=p["headers"])
    before = client.get(f"{API}/me/collection", params={"ownership": "owned"}, headers=p["headers"]).json()

    client.post(f"{API}/auth/logout", headers=p["headers"])
    h = auth_headers(login(client, "lina", PASSWORD))
    after = client.get(f"{API}/me/collection", params={"ownership": "owned"}, headers=h).json()

    assert after["items"] == before["items"]
    assert after["progress"]["totalCards"] == 5


def test_concurrent_requests_open_one_booster(client):
    """Requêtes simultanées du même joueur : un seul booster est ouvert."""
    p = register_and_login(client, "Lina")
    results = _open_concurrently([p["id"]] * 4)
    assert sorted(results, key=str) == [5, "conflict", "conflict", "conflict"]
    assert client.get(f"{API}/me", headers=p["headers"]).json()["progress"]["totalCards"] == 5
    assert len(booster_history(p["id"])) == 5
    assert_stock_invariant()


def test_exhausted_legendaries_cancel_the_booster_without_losing_it(client):
    set_weights(**ONLY_LEGENDARIES)  # seules les légendaires sont tirables
    set_stock({"Serazou": 1, "DioDaLionseau": 0})
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    not_first_booster(a["id"], b["id"])

    # Une légendaire, puis plus rien de tirable (exclusion) : booster partiel d'une carte.
    cards = client.post(f"{API}/me/boosters", headers=a["headers"]).json()["cards"]
    assert [c["creature"]["name"] for c in cards] == ["Serazou"]

    # Plus aucune légendaire : booster annulé, et Bob ne le perd pas.
    body = problem(client.post(f"{API}/me/boosters", headers=b["headers"]), 409, "CARDS_UNAVAILABLE")
    assert "épuisées" in body["detail"]
    assert client.get(f"{API}/me/boosters/today", headers=b["headers"]).json()["available"] is True
    assert booster_history(b["id"]) == []
    assert_stock_invariant()


def test_concurrent_boosters_never_exceed_legendary_stock(client):
    """Quatre joueurs se disputent les 3 derniers exemplaires légendaires."""
    set_weights(**ONLY_LEGENDARIES)
    set_stock({"Serazou": 2, "DioDaLionseau": 1})
    players = [register_and_login(client, f"Joueur{i}") for i in range(4)]
    not_first_booster(*(p["id"] for p in players))

    results = _open_concurrently([p["id"] for p in players])

    assert sorted(results, key=str) == [1, 1, 1, "conflict"]
    assert_stock_invariant()


def test_unlimited_creatures_never_run_out(client):
    """Commune, peu commune et rare n'ont pas de stock : leur stock reste NULL."""
    p = register_and_login(client, "Lina")
    client.post(f"{API}/me/boosters", headers=p["headers"])
    with SessionLocal() as db:
        from sqlalchemy import select

        from app.models import Creature

        stocks = set(db.execute(select(Creature.stock_total, Creature.stock_restant).where(Creature.rarete != Rarete.LEGENDAIRE)))
    assert stocks == {(None, None)}
