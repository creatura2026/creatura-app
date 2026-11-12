import pytest
from conftest import API, PASSWORD, SessionLocal, auth_headers, catalogue_size, login, problem, register_and_login
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.errors import from_integrity_error
from app.models import Utilisateur


def register(client, pseudo="Lina", login_="lina", password=PASSWORD, **extra):
    return client.post(f"{API}/auth/register", json={"pseudo": pseudo, "login": login_, "password": password, **extra})


def test_login_with_pgcrypto_hash_like_demo_accounts(client):
    """Les comptes de démo (db/init/03_demo_dev.sql) sont hachés par pgcrypto en $2a$10$."""
    with SessionLocal() as db:
        db.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        db.execute(
            text(
                "INSERT INTO utilisateur (pseudo, identifiant, mot_de_passe_hash) "
                "VALUES ('Alice', 'joueur1', crypt('joueur1', gen_salt('bf', 10)))"
            )
        )
        db.commit()
    # Mot de passe de démo de 7 caractères : la connexion n'impose pas de longueur minimale.
    tokens = login(client, "joueur1", "joueur1")
    assert tokens["user"]["pseudo"] == "Alice" and tokens["user"]["role"] == "PLAYER"
    assert client.get(f"{API}/me", headers=auth_headers(tokens)).json()["pseudo"] == "Alice"


def test_register_and_login(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"id", "pseudo", "role", "createdAt"}
    assert body["pseudo"] == "Lina" and body["role"] == "PLAYER"

    # Le mot de passe est stocké en bcrypt.
    with SessionLocal() as db:
        stored = db.scalar(select(Utilisateur.mot_de_passe_hash).where(Utilisateur.identifiant == "lina"))
    assert stored.startswith("$2b$")

    tokens = login(client, "lina", PASSWORD)
    assert tokens["tokenType"] == "Bearer" and tokens["expiresIn"] == 15 * 60
    assert tokens["user"] == body

    me = client.get(f"{API}/me", headers=auth_headers(tokens)).json()
    assert me["pseudo"] == "Lina" and me["boosterAvailableToday"] is True
    assert me["progress"] == {
        "ownedCreatures": 0, "totalCreatures": catalogue_size(), "totalCards": 0, "completionPercent": 0.0,
    }  # fmt: skip


@pytest.mark.parametrize(
    ("fields", "field"),
    [
        ({"pseudo": "     "}, "pseudo"),
        ({"pseudo": "Li"}, "pseudo"),  # 3 caractères minimum
        ({"pseudo": "Lina Martin"}, "pseudo"),  # lettres, chiffres, _ et - uniquement
        ({"password": "court"}, "password"),  # 12 caractères minimum
        ({"password": "é" * 40}, "password"),  # 80 octets : au-delà de la limite de bcrypt
    ],
)
def test_register_validation(client, fields, field):
    body = problem(register(client, **fields), 400, "VALIDATION_ERROR")
    assert [e["field"] for e in body["errors"]] == [field]


def test_unknown_field_rejected(client):
    body = problem(register(client, role="ADMIN"), 400, "VALIDATION_ERROR")
    assert body["errors"] == [{"field": "role", "message": "champ non autorisé"}]


def test_pseudo_and_login_unique(client):
    register_and_login(client, "Noe")
    body = problem(register(client, pseudo="NOE", login_="autre"), 409, "PSEUDO_ALREADY_USED")
    assert body["errors"][0]["field"] == "pseudo"
    problem(register(client, pseudo="Autre", login_="noe"), 409, "LOGIN_ALREADY_USED")


def test_constraint_names_translated_to_error_codes(client):
    """Les contraintes nommées du schéma deviennent des codes du contrat (tableau de db/README.md)."""
    with SessionLocal() as db:
        db.add(Utilisateur(pseudo="Lina", identifiant="lina", mot_de_passe_hash="x"))
        db.commit()
        db.add(Utilisateur(pseudo="LINA", identifiant="autre", mot_de_passe_hash="x"))
        with pytest.raises(IntegrityError) as dup_pseudo:
            db.commit()
        db.rollback()
        db.add(Utilisateur(pseudo="Noe", identifiant="  ", mot_de_passe_hash="x"))
        with pytest.raises(IntegrityError) as blank_login:
            db.commit()

    assert (from_integrity_error(dup_pseudo.value).status_code, from_integrity_error(dup_pseudo.value).code) == (
        409, "PSEUDO_ALREADY_USED"
    )
    assert from_integrity_error(blank_login.value).code == "VALIDATION_ERROR"


def test_health_without_token(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_bad_password(client):
    register_and_login(client, "Mina")
    r = client.post(f"{API}/auth/login", json={"login": "mina", "password": "mauvais-mot-de-passe"})
    problem(r, 401, "INVALID_CREDENTIALS")


def test_routes_require_token(client):
    problem(client.get(f"{API}/me"), 401, "UNAUTHENTICATED")
    problem(client.get(f"{API}/creatures"), 401, "UNAUTHENTICATED")
    r = client.get(f"{API}/me", headers={"Authorization": "Bearer pas-un-jeton"})
    problem(r, 401, "UNAUTHENTICATED")
    assert r.headers["www-authenticate"] == "Bearer"


def test_unknown_route_is_a_problem(client):
    problem(client.get(f"{API}/n-existe-pas"), 404, "NOT_FOUND")


def test_refresh_and_logout(client):
    p = register_and_login(client, "Lina")
    r = client.post(f"{API}/auth/refresh", json={"refreshToken": p["tokens"]["refreshToken"]})
    assert r.status_code == 200
    new_tokens = r.json()
    assert new_tokens["user"]["pseudo"] == "Lina"
    assert client.get(f"{API}/me", headers=auth_headers(new_tokens)).status_code == 200

    # Un jeton d'accès ne peut pas servir de jeton de rafraîchissement.
    problem(client.post(f"{API}/auth/refresh", json={"refreshToken": new_tokens["accessToken"]}), 401, "UNAUTHENTICATED")

    r = client.post(
        f"{API}/auth/logout", json={"refreshToken": new_tokens["refreshToken"]}, headers=auth_headers(new_tokens)
    )
    assert r.status_code == 204
