from conftest import API, SessionLocal, auth_headers, login, register_and_login
from sqlalchemy import select

from app.models import Utilisateur


def test_health_without_token(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_register_and_login(client):
    r = client.post(f"{API}/auth/register", json={"pseudo": "Lina", "login": "lina", "password": "password123"})
    assert r.status_code == 201
    body = r.json()
    assert body["pseudo"] == "Lina" and body["role"] == "JOUEUR" and body["last_booster"] is None
    assert "password" not in str(body)

    # Le mot de passe est stocké en bcrypt.
    with SessionLocal() as db:
        stored = db.scalar(select(Utilisateur.mot_de_passe_hash).where(Utilisateur.identifiant == "lina"))
    assert stored.startswith("$2b$")

    tokens = login(client, "lina", "password123")
    me = client.get(f"{API}/me", headers=auth_headers(tokens))
    assert me.status_code == 200
    assert me.json()["collection"]["owned_distinct"] == 0


def test_pseudo_unique_case_insensitive(client):
    register_and_login(client, "Noe")
    r = client.post(f"{API}/auth/register", json={"pseudo": "NOE", "login": "autre", "password": "password123"})
    assert r.status_code == 409
    r = client.post(f"{API}/auth/register", json={"pseudo": "Autre", "login": "noe", "password": "password123"})
    assert r.status_code == 409


def test_password_too_long_for_bcrypt(client):
    r = client.post(f"{API}/auth/register", json={"pseudo": "Lina", "login": "lina", "password": "é" * 40})
    assert r.status_code == 422  # 80 octets > 72


def test_login_bad_password(client):
    register_and_login(client, "Mina")
    r = client.post(f"{API}/auth/login", json={"login": "mina", "password": "mauvais-mdp"})
    assert r.status_code == 401


def test_routes_require_token(client):
    assert client.get(f"{API}/me").status_code == 401
    assert client.get(f"{API}/creatures").status_code == 401
    assert client.get(f"{API}/me", headers={"Authorization": "Bearer pas-un-jeton"}).status_code == 401


def test_refresh_and_logout(client):
    p = register_and_login(client, "Lina")
    r = client.post(f"{API}/auth/refresh", json={"refresh_token": p["tokens"]["refresh_token"]})
    assert r.status_code == 200
    new_tokens = r.json()
    assert client.get(f"{API}/me", headers=auth_headers(new_tokens)).status_code == 200

    # Un jeton d'accès ne peut pas servir de jeton de rafraîchissement.
    r = client.post(f"{API}/auth/refresh", json={"refresh_token": new_tokens["access_token"]})
    assert r.status_code == 401

    assert client.post(f"{API}/auth/logout", headers=auth_headers(new_tokens)).status_code == 204
