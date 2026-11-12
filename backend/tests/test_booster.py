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
    give,
    login,
    problem,
    register_and_login,
    set_booster_size,
    set_stock,
)

from app.controllers import booster
from app.database import SessionLocal
from app.errors import Conflict
from app.models import Utilisateur

PARIS = ZoneInfo("Europe/Paris")


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
    h = register_and_login(client, "Lina")["headers"]

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
    assert today["available"] is False and today["booster"] is None  # pas de table booster

    me = client.get(f"{API}/me", headers=h).json()
    assert me["progress"]["totalCards"] == 5 and me["boosterAvailableToday"] is False
    assert_stock_invariant()


def test_new_cards_are_flagged(client):
    set_stock({"Moussou": 3, "Brumel": 2})
    p = register_and_login(client, "Lina")
    give(p["id"], "Moussou", 1)  # il ne reste que 2 Moussou et 2 Brumel à tirer

    cards = client.post(f"{API}/me/boosters", headers=p["headers"]).json()["cards"]
    assert sorted(c["creature"]["name"] for c in cards) == ["Brumel", "Brumel", "Moussou", "Moussou"]
    assert all(not c["isNew"] for c in cards if c["creature"]["name"] == "Moussou")  # déjà possédée
    # Seul le premier Brumel est nouveau : le second est un doublon du même booster.
    assert [c["isNew"] for c in cards if c["creature"]["name"] == "Brumel"] == [True, False]


def test_booster_size_follows_admin_setting(client, admin_headers):
    h = register_and_login(client, "Lina")["headers"]
    client.put(f"{API}/admin/settings/booster", json={"cardsPerBooster": 3}, headers=admin_headers)

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
    assert_stock_invariant()


def test_stock_exhausted_booster_is_cancelled_not_lost(client):
    set_stock({"Brumel": 2})
    set_booster_size(5)
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")

    # Plus que 2 exemplaires dans tout le jeu : booster partiel.
    cards = client.post(f"{API}/me/boosters", headers=a["headers"]).json()["cards"]
    assert [c["creature"]["name"] for c in cards] == ["Brumel", "Brumel"]

    # Tout est épuisé : booster annulé, et Bob ne le perd pas.
    body = problem(client.post(f"{API}/me/boosters", headers=b["headers"]), 409, "CARDS_UNAVAILABLE")
    assert "épuisées" in body["detail"]
    assert client.get(f"{API}/me/boosters/today", headers=b["headers"]).json()["available"] is True
    assert_stock_invariant()


def test_concurrent_boosters_never_exceed_stock(client):
    """Plusieurs joueurs se disputent les 7 derniers exemplaires du jeu."""
    set_stock({"Moussou": 4, "Cristille": 3})
    players = [register_and_login(client, f"Joueur{i}") for i in range(4)]

    results = _open_concurrently([p["id"] for p in players])

    assert sum(r for r in results if r != "conflict") == 7
    assert_stock_invariant()
