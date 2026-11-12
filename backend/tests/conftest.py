"""Les tests tournent sur un vrai PostgreSQL : avant chaque test, la base est recréée avec les
scripts de db/init/ (schéma + catalogue, sans les données de démo), comme en production.

Par défaut : base `creatura_test` sur le Postgres de db/ (créée si besoin, la base `creatura`
n'est pas touchée). Autre serveur : variable TEST_DATABASE_URL.
"""

import os
import uuid
from pathlib import Path

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgres://creatura:creatura@localhost:5432/creatura_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ADMIN_LOGIN"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-password"
os.environ["BOOSTER_SIZE"] = "5"

DB_INIT_DIR = Path(__file__).resolve().parents[2] / "db" / "init"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select, text, update  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.controllers import collection  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Creature  # noqa: E402

API = "/api/v1"


def _ensure_test_database() -> None:
    url = make_url(get_settings().database_url)
    server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as conn:
        if not conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}):
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    server.dispose()


def init_scripts() -> list[Path]:
    """Scripts de db/init/ dans l'ordre, sans les données de démo (comme CREATURA_DEMO=false)."""
    scripts = [f for f in sorted(DB_INIT_DIR.glob("*.sql")) if "demo" not in f.name]
    assert scripts, f"aucun script SQL dans {DB_INIT_DIR}"
    return scripts


def reset_database() -> None:
    engine.dispose()
    raw = engine.raw_connection()
    try:
        raw.driver_connection.autocommit = True  # les scripts gèrent leurs propres BEGIN/COMMIT
        cur = raw.cursor()
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        for sql_file in init_scripts():
            cur.execute(sql_file.read_text())
    finally:
        raw.close()
    engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    _ensure_test_database()


@pytest.fixture
def client():
    reset_database()
    with TestClient(app) as c:  # le lifespan crée le compte admin
        yield c


@pytest.fixture
def admin_headers(client):
    return auth_headers(login(client, "admin", "admin-password"))


def register_and_login(client: TestClient, pseudo: str, password: str = "password123") -> dict:
    """Crée un joueur et retourne {id, headers, tokens}."""
    r = client.post(f"{API}/auth/register", json={"pseudo": pseudo, "login": pseudo.lower(), "password": password})
    assert r.status_code == 201, r.text
    tokens = login(client, pseudo.lower(), password)
    return {"id": uuid.UUID(r.json()["id"]), "tokens": tokens, "headers": auth_headers(tokens)}


def login(client: TestClient, login_: str, password: str) -> dict:
    r = client.post(f"{API}/auth/login", json={"login": login_, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def creature_id(name: str) -> int:
    with SessionLocal() as db:
        return db.scalar(select(Creature.id).where(Creature.nom == name))


def give(user_id: uuid.UUID, name: str, quantity: int = 1) -> None:
    """Donne des cartes à un joueur en les sortant du stock, comme le ferait un booster."""
    cid = creature_id(name)
    with SessionLocal() as db:
        taken = db.execute(
            update(Creature)
            .where(Creature.id == cid, Creature.stock_restant >= quantity)
            .values(stock_restant=Creature.stock_restant - quantity)
        ).rowcount
        assert taken == 1, f"stock insuffisant pour {name}"
        collection.add_cards(db, user_id, cid, quantity)
        db.commit()


def quantity(user_id: uuid.UUID, name: str) -> int:
    with SessionLocal() as db:
        return collection.owned_quantity(db, user_id, creature_id(name))


def set_stock(stocks: dict[str, int]) -> None:
    """Vide le stock de toutes les créatures, sauf celles citées (à appeler avant tout tirage)."""
    with SessionLocal() as db:
        db.execute(update(Creature).values(stock_total=0, stock_restant=0))
        for name, n in stocks.items():
            db.execute(update(Creature).where(Creature.nom == name).values(stock_total=n, stock_restant=n))
        db.commit()


def assert_stock_invariant() -> None:
    """Règle du schéma : stock_total = stock_restant + Σ quantités en collection, rien de négatif."""
    with SessionLocal() as db:
        broken = db.scalars(
            text(
                """
                SELECT c.nom FROM creature c
                LEFT JOIN (SELECT creature_id, SUM(quantite) AS s FROM collection GROUP BY creature_id) x
                       ON x.creature_id = c.id
                WHERE c.stock_total <> c.stock_restant + COALESCE(x.s, 0)
                """
            )
        ).all()
        negative = db.scalar(text("SELECT count(*) FROM collection WHERE quantite < 0"))
    assert broken == [] and negative == 0
