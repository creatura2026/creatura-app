"""AS-75 : lien de réinitialisation du mot de passe, généré par un admin pour un joueur."""

from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

from sqlalchemy import text

from conftest import API, PASSWORD, login, problem, register_and_login
from app.database import SessionLocal

NEW_PASSWORD = "nouveau-mot-de-passe"


def new_link(client, admin_headers, player_id) -> tuple[str, dict]:
    r = client.post(f"{API}/admin/players/{player_id}/password-reset", headers=admin_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    token = parse_qs(urlparse(body["url"]).query)["jeton"][0]
    return token, body


def reset(client, token: str, password: str = NEW_PASSWORD):
    return client.post(f"{API}/auth/password-reset", json={"token": token, "newPassword": password})


def test_link_lets_the_player_choose_a_new_password(client, admin_headers):
    alice = register_and_login(client, "Alice")
    token, body = new_link(client, admin_headers, alice["id"])
    assert urlparse(body["url"]).path.endswith("/reinitialiser")
    expires = datetime.fromisoformat(body["expiresAt"])
    assert timedelta(minutes=4) < expires - datetime.now(expires.tzinfo) <= timedelta(minutes=5)

    # La base ne garde que l'empreinte du jeton
    with SessionLocal() as db:
        stored = db.scalar(text("SELECT jeton_hash FROM reinitialisation_mdp"))
    assert stored != token and len(stored) == 64

    r = reset(client, token)
    assert r.status_code == 204, r.text
    assert login(client, "alice", NEW_PASSWORD)["user"]["pseudo"] == "Alice"
    problem(client.post(f"{API}/auth/login", json={"login": "alice", "password": PASSWORD}), 401, "INVALID_CREDENTIALS")

    # Usage unique
    problem(reset(client, token, "encore-un-autre-mdp"), 400, "RESET_LINK_INVALID")


def test_invalid_links_get_the_same_answer(client, admin_headers):
    alice = register_and_login(client, "Alice")
    problem(reset(client, "jeton-inconnu"), 400, "RESET_LINK_INVALID")

    # Un nouveau lien annule le précédent
    first, _ = new_link(client, admin_headers, alice["id"])
    second, _ = new_link(client, admin_headers, alice["id"])
    problem(reset(client, first), 400, "RESET_LINK_INVALID")

    # Expiré au bout de 5 minutes
    with SessionLocal() as db:
        db.execute(
            text(
                "UPDATE reinitialisation_mdp SET cree_le = cree_le - interval '10 minutes',"
                " expire_le = expire_le - interval '10 minutes' WHERE utilise_le IS NULL AND annule_le IS NULL"
            )
        )
        db.commit()
    problem(reset(client, second), 400, "RESET_LINK_INVALID")
    assert login(client, "alice", PASSWORD)["user"]["pseudo"] == "Alice"  # rien n'a changé

    third, _ = new_link(client, admin_headers, alice["id"])
    problem(reset(client, third, "court"), 400, "VALIDATION_ERROR")  # 12 caractères minimum
    assert reset(client, third).status_code == 204


def test_only_admins_create_links_and_only_for_players(client, admin_headers):
    alice = register_and_login(client, "Alice")
    bob = register_and_login(client, "Bob")
    problem(client.post(f"{API}/admin/players/{alice['id']}/password-reset", headers=bob["headers"]), 403, "FORBIDDEN")
    admin_id = client.get(f"{API}/me", headers=admin_headers).json()["id"]
    problem(client.post(f"{API}/admin/players/{admin_id}/password-reset", headers=admin_headers), 404, "NOT_FOUND")
    unknown = "00000000-0000-0000-0000-000000000099"
    problem(client.post(f"{API}/admin/players/{unknown}/password-reset", headers=admin_headers), 404, "NOT_FOUND")
