from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from conftest import API, assert_stock_invariant, auth_headers, login, register_and_login, set_stock

from app.controllers import booster
from app.database import SessionLocal
from app.errors import Conflict
from app.models import Utilisateur


def _open_concurrently(user_ids: list) -> list[str]:
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
    assert today["available"] is True and today["next_available_at"] is None

    r = client.post(f"{API}/me/boosters", headers=h)
    assert r.status_code == 201
    assert len(r.json()["cards"]) == 5

    # Une nouvelle demande le même jour ne donne aucune carte.
    assert client.post(f"{API}/me/boosters", headers=h).status_code == 409

    today = client.get(f"{API}/me/boosters/today", headers=h).json()
    assert today["available"] is False
    assert today["last_booster"] == today["day"]
    assert today["next_available_at"] is not None

    me = client.get(f"{API}/me", headers=h).json()
    assert me["collection"]["total_cards"] == 5
    assert me["last_booster"] == today["day"]
    assert_stock_invariant()


def test_collection_persists_after_reconnection(client):
    """Preuve qualité 01 : après reconnexion, la collection est conservée."""
    p = register_and_login(client, "Lina")
    client.post(f"{API}/me/boosters", headers=p["headers"])
    before = client.get(f"{API}/me/collection", params={"status": "owned"}, headers=p["headers"]).json()

    client.post(f"{API}/auth/logout", headers=p["headers"])
    h = auth_headers(login(client, "lina", "password123"))
    after = client.get(f"{API}/me/collection", params={"status": "owned"}, headers=h).json()

    assert after["items"] == before["items"]
    assert after["summary"]["total_cards"] == 5


def test_concurrent_requests_open_one_booster(client):
    """Requêtes simultanées du même joueur : un seul booster est ouvert."""
    p = register_and_login(client, "Lina")
    results = _open_concurrently([p["id"]] * 4)
    assert sorted(results, key=str) == [5, "conflict", "conflict", "conflict"]
    assert client.get(f"{API}/me", headers=p["headers"]).json()["collection"]["total_cards"] == 5
    assert_stock_invariant()


def test_stock_exhausted_booster_is_cancelled_not_lost(client):
    set_stock({"Brumel": 2})
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")

    # Plus que 2 exemplaires dans tout le jeu : booster partiel.
    cards = client.post(f"{API}/me/boosters", headers=a["headers"]).json()["cards"]
    assert [c["name"] for c in cards] == ["Brumel", "Brumel"]
    assert cards[0]["stock_remaining"] == 0

    # Tout est épuisé : booster annulé, et Bob ne le perd pas.
    r = client.post(f"{API}/me/boosters", headers=b["headers"])
    assert r.status_code == 409 and "épuisées" in r.json()["detail"]
    assert client.get(f"{API}/me/boosters/today", headers=b["headers"]).json()["available"] is True
    assert_stock_invariant()


def test_concurrent_boosters_never_exceed_stock(client):
    """Plusieurs joueurs se disputent les 7 derniers exemplaires du jeu."""
    set_stock({"Moussou": 4, "Cristille": 3})
    players = [register_and_login(client, f"Joueur{i}") for i in range(4)]

    results = _open_concurrently([p["id"] for p in players])

    assert sum(r for r in results if r != "conflict") == 7
    assert_stock_invariant()
