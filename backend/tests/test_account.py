"""Gestion du compte : changement du mot de passe, suppression du compte (anonymisation)."""

import time
import uuid

from conftest import (
    API,
    PASSWORD,
    assert_stock_invariant,
    auth_headers,
    give,
    live,
    login,
    open_trade,
    problem,
    quantity,
    register_and_login,
)
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Creature, Role, Utilisateur
from app.security import hash_password

NEW_PASSWORD = "nouveau-mot-de-passe-42"


# ── Mot de passe ─────────────────────────────────────────────────────────────


def test_change_password(client):
    p = register_and_login(client, "Nina")
    r = client.put(
        f"{API}/me/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=p["headers"],
    )
    assert r.status_code == 200, r.text
    fresh = r.json()
    assert fresh["accessToken"] and fresh["refreshToken"] and fresh["user"]["pseudo"] == "Nina"

    # Cette session continue avec ses nouveaux jetons.
    assert client.get(f"{API}/me", headers=auth_headers(fresh)).status_code == 200
    # Nouveau mot de passe seulement.
    problem(client.post(f"{API}/auth/login", json={"login": "nina", "password": PASSWORD}), 401, "INVALID_CREDENTIALS")
    assert login(client, "nina", NEW_PASSWORD)["accessToken"]


def test_password_change_closes_other_sessions(client):
    """Changer son mot de passe coupe un intrus qui aurait volé une session (jetons d'avant refusés)."""
    p = register_and_login(client, "Omar")
    stolen = p["tokens"]
    time.sleep(1.1)  # `iat` est en secondes : les jetons volés datent d'avant le changement
    r = client.put(
        f"{API}/me/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=p["headers"],
    )
    assert r.status_code == 200, r.text
    problem(client.get(f"{API}/me", headers=auth_headers(stolen)), 401, "UNAUTHENTICATED")
    problem(client.post(f"{API}/auth/refresh", json={"refreshToken": stolen["refreshToken"]}), 401, "UNAUTHENTICATED")
    assert client.get(f"{API}/me", headers=auth_headers(r.json())).status_code == 200


def test_password_change_validation(client):
    p = register_and_login(client, "Paul")
    url, h = f"{API}/me/password", p["headers"]
    body = problem(client.put(url, json={"currentPassword": "faux-mot-de-passe", "newPassword": NEW_PASSWORD}, headers=h), 400, "VALIDATION_ERROR")
    assert body["errors"][0]["field"] == "currentPassword"
    body = problem(client.put(url, json={"currentPassword": PASSWORD, "newPassword": "court"}, headers=h), 400, "VALIDATION_ERROR")
    assert body["errors"][0]["field"] == "newPassword"
    body = problem(client.put(url, json={"currentPassword": PASSWORD, "newPassword": PASSWORD}, headers=h), 400, "VALIDATION_ERROR")
    assert body["errors"][0]["field"] == "newPassword"
    problem(client.put(url, json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD}), 401, "UNAUTHENTICATED")
    # Rien n'a changé.
    assert login(client, "paul", PASSWORD)["accessToken"]


# ── Suppression du compte ────────────────────────────────────────────────────


def test_delete_account(client):
    a, b = register_and_login(client, "Alice"), register_and_login(client, "Bob")
    give(a["id"], "Moussou", 2)
    give(a["id"], "Serazou", 1)  # légendaire : stock limité
    with SessionLocal() as db:
        stock_before = db.scalar(select(Creature.stock_restant).where(Creature.nom == "Serazou"))

    trade = open_trade(client, b, a)  # Bob propose, Alice reçoit
    with live(client, b, trade["id"]) as room_b:
        problem(client.request("DELETE", f"{API}/me", json={"password": "faux-mot-de-passe"}, headers=a["headers"]), 400, "VALIDATION_ERROR")
        r = client.request("DELETE", f"{API}/me", json={"password": PASSWORD}, headers=a["headers"])
        assert r.status_code == 204, r.text
        # La salle de Bob est prévenue : Alice (destinataire) a refusé en partant.
        assert room_b.next("trade")["trade"]["status"] == "REFUSED"

    # Plus de connexion, plus de session.
    problem(client.post(f"{API}/auth/login", json={"login": "alice", "password": PASSWORD}), 401, "INVALID_CREDENTIALS")
    problem(client.get(f"{API}/me", headers=a["headers"]), 401, "UNAUTHENTICATED")
    problem(client.post(f"{API}/auth/refresh", json={"refreshToken": a["tokens"]["refreshToken"]}), 401, "UNAUTHENTICATED")

    # Collection effacée, légendaire rendue au stock.
    assert quantity(a["id"], "Moussou") == 0 and quantity(a["id"], "Serazou") == 0
    with SessionLocal() as db:
        assert db.scalar(select(Creature.stock_restant).where(Creature.nom == "Serazou")) == stock_before + 1
    assert_stock_invariant()

    # Historique de Bob anonymisé ; Alice introuvable pour les autres joueurs.
    history = client.get(f"{API}/trades", headers=b["headers"]).json()["items"]
    assert history[0]["recipient"]["pseudo"].startswith("Joueur supprimé #")
    assert client.get(f"{API}/players", params={"search": "ali"}, headers=b["headers"]).json()["items"] == []
    problem(client.post(f"{API}/trades", json={"recipientId": str(a["id"])}, headers=b["headers"]), 404, "NOT_FOUND")

    # Identifiant et pseudo libérés : quelqu'un peut se réinscrire avec.
    again = register_and_login(client, "Alice")
    assert again["id"] != a["id"]


def test_last_admin_cannot_delete_account(client, admin_headers):
    problem(client.request("DELETE", f"{API}/me", json={"password": "admin-password"}, headers=admin_headers), 409, "LAST_ADMIN")
    assert client.get(f"{API}/me", headers=admin_headers).status_code == 200

    # Avec un second administrateur, la suppression est possible.
    with SessionLocal() as db:
        db.add(Utilisateur(id=uuid.uuid4(), pseudo="Admin2", identifiant="admin2", mot_de_passe_hash=hash_password("admin2-password"), role=Role.ADMIN))
        db.commit()
    r = client.request("DELETE", f"{API}/me", json={"password": "admin-password"}, headers=admin_headers)
    assert r.status_code == 204, r.text
    # Le second est désormais le dernier.
    second = auth_headers(login(client, "admin2", "admin2-password"))
    problem(client.request("DELETE", f"{API}/me", json={"password": "admin2-password"}, headers=second), 409, "LAST_ADMIN")
