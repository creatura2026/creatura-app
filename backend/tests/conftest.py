"""Les tests tournent sur un vrai PostgreSQL : avant chaque test, la base est recréée avec les
scripts de db/init/ (schéma + catalogue, sans les données de démo), comme en production.

Par défaut : base `creatura_test` sur le Postgres de db/ (créée si besoin, la base `creatura`
n'est pas touchée). Autre serveur : variable TEST_DATABASE_URL.
"""

import os
import uuid
from contextlib import contextmanager
from pathlib import Path

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgres://creatura:creatura@127.0.0.1:5432/creatura_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ADMIN_LOGIN"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-password"
# Les tests visent toujours le Postgres local, même si backend/.env vise RDS.
os.environ["DB_IAM_AUTH"] = "false"
os.environ["DB_IAM_HOST"] = ""
os.environ["DB_IAM_PORT"] = ""
os.environ["IMAGE_BASE_URL"] = "https://cdn.test"

DB_INIT_DIR = Path(__file__).resolve().parents[2] / "db" / "init"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, func, or_, select, text, update  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.controllers import collection  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import BoosterCarte, Creature, Rarete, RareteTirage, Reglage, Utilisateur  # noqa: E402

API = "/api/v1"
PASSWORD = "password-1234"  # 12 caractères minimum (contrat)


def _ensure_test_database() -> None:
    url = make_url(get_settings().database_url)
    server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as conn:
        if not conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}):
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    server.dispose()


def init_scripts() -> list[Path]:
    """Scripts de db/init/ dans l'ordre de db/scripts/appliquer.sh, sans les données de démo
    (comme CREATURA_DEMO=false) : schéma, évolutions, puis catalogue, qui peut en dépendre."""
    scripts = [f for f in sorted(DB_INIT_DIR.glob("*.sql")) if "demo" not in f.name]
    assert scripts, f"aucun script SQL dans {DB_INIT_DIR}"
    evolutions = [f for f in scripts if "_evolution_" in f.name]
    others = [f for f in scripts if f not in evolutions]
    return others[:1] + evolutions + others[1:]


def reset_database() -> None:
    engine.dispose()
    raw = engine.raw_connection()
    try:
        raw.driver_connection.autocommit = True  # les scripts gèrent leurs propres BEGIN/COMMIT
        cur = raw.cursor()
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        for sql_file in init_scripts():
            cur.execute(sql_file.read_text(encoding="utf-8"))  # Windows lirait en cp1252
    finally:
        raw.close()
    engine.dispose()


@pytest.fixture(scope="session")
def _test_database():
    # Pas autouse : les tests de l'algorithme pur (test_draw.py) tournent sans base.
    _ensure_test_database()


@pytest.fixture
def client(_test_database):
    reset_database()
    with TestClient(app) as c:  # le lifespan crée le compte admin
        yield c


@pytest.fixture
def admin_headers(client):
    return auth_headers(login(client, "admin", "admin-password"))


def register_and_login(client: TestClient, pseudo: str, password: str = PASSWORD) -> dict:
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
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


def problem(response, status: int, code: str) -> dict:
    """Vérifie une erreur au format Problem Details du contrat et la retourne."""
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["code"] == code and body["status"] == status and body["title"] and body["detail"], body
    return body


def _pk(name: str) -> int:
    with SessionLocal() as db:
        return db.scalar(select(Creature.id).where(Creature.nom == name))


def catalogue_size() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Creature))


def creature_id(name: str) -> str:
    """Identifiant d'une créature tel que l'API l'expose (texte)."""
    return str(_pk(name))


def give(user_id: uuid.UUID, name: str, quantity: int = 1) -> None:
    """Donne des cartes à un joueur comme le ferait un booster (légendaire : sortie du stock)."""
    cid = _pk(name)
    with SessionLocal() as db:
        taken = db.execute(
            update(Creature)
            .where(Creature.id == cid, or_(Creature.stock_restant.is_(None), Creature.stock_restant >= quantity))
            .values(stock_restant=Creature.stock_restant - quantity)  # NULL (illimité) reste NULL
        ).rowcount
        assert taken == 1, f"stock insuffisant pour {name}"
        collection.add_cards(db, user_id, cid, quantity)
        db.commit()


def quantity(user_id: uuid.UUID, name: str) -> int:
    with SessionLocal() as db:
        return collection.owned_quantity(db, user_id, _pk(name))


def set_booster_size(cards: int) -> None:
    with SessionLocal() as db:
        db.execute(update(Reglage).values(cartes_par_booster=cards))
        db.commit()


def set_stock(stocks: dict[str, int]) -> None:
    """Fixe le stock des légendaires citées (les autres créatures sont illimitées)."""
    with SessionLocal() as db:
        for name, n in stocks.items():
            done = db.execute(update(Creature).where(Creature.nom == name).values(stock_total=n, stock_restant=n))
            assert done.rowcount == 1, name
        db.commit()


def set_weights(**weights: int) -> None:
    """Poids de tirage par rareté, ex. set_weights(COMMUN=1, PEU_COMMUN=0, RARE=0, LEGENDAIRE=0)."""
    with SessionLocal() as db:
        for rarete, poids in weights.items():
            db.execute(update(RareteTirage).where(RareteTirage.rarete == Rarete(rarete)).values(poids=poids))
        db.commit()


def only_creatures(rarete: str, names: list[str]) -> None:
    """Ne laisse que `names` dans la rareté `rarete` : les autres passent en RARE (illimitées).

    Rend un tirage prévisible quand seule cette rareté a un poids. Pas pour les légendaires.
    """
    with SessionLocal() as db:
        db.execute(
            update(Creature)
            .where(Creature.rarete == Rarete(rarete), Creature.nom.not_in(names))
            .values(rarete=Rarete.RARE)
        )
        db.commit()


def pass_midnight() -> None:
    """Simule le passage de minuit : les changements prévus « demain » deviennent dus aujourd'hui."""
    with SessionLocal() as db:
        db.execute(text("UPDATE reglage SET suivant_a_partir_du = suivant_a_partir_du - 1 WHERE suivant_a_partir_du IS NOT NULL"))
        db.execute(text("UPDATE creature SET disponible_le = disponible_le - 1"))
        db.execute(text("UPDATE creature SET changement_le = changement_le - 1 WHERE changement_le IS NOT NULL"))
        db.commit()


def not_first_booster(*user_ids: uuid.UUID) -> None:
    """Fait comme si ces joueurs avaient déjà ouvert un booster (hier) : pas de rare garantie."""
    with SessionLocal() as db:
        db.execute(
            update(Utilisateur)
            .where(Utilisateur.id.in_(user_ids))
            .values(dernier_booster=func.current_date() - 1)
        )
        db.commit()


def booster_history(user_id: uuid.UUID | None = None) -> list[BoosterCarte]:
    """Lignes de booster_carte, dans l'ordre des boosters puis des positions."""
    with SessionLocal() as db:
        query = select(BoosterCarte).order_by(BoosterCarte.tire_le, BoosterCarte.booster_id, BoosterCarte.position)
        if user_id is not None:
            query = query.where(BoosterCarte.utilisateur_id == user_id)
        return list(db.scalars(query))


def assert_stock_invariant() -> None:
    """Règle du schéma pour les légendaires : stock_total = stock_restant + Σ quantités en collection.
    Aucune quantité négative."""
    with SessionLocal() as db:
        broken = db.scalars(
            text(
                """
                SELECT c.nom FROM creature c
                LEFT JOIN (SELECT creature_id, SUM(quantite) AS s FROM collection GROUP BY creature_id) x
                       ON x.creature_id = c.id
                WHERE c.stock_total IS NOT NULL AND c.stock_total <> c.stock_restant + COALESCE(x.s, 0)
                """
            )
        ).all()
        negative = db.scalar(text("SELECT count(*) FROM collection WHERE quantite < 0"))
    assert broken == [] and negative == 0


# ── Salle d'échange ──────────────────────────────────────────────────────────


def open_trade(client: TestClient, proposer: dict, recipient: dict, wanted: str | None = None) -> dict:
    """Ouvre une salle d'échange (tapis vides) et la retourne."""
    body = {"recipientId": str(recipient["id"])}
    if wanted:
        body["wantedCreatureId"] = creature_id(wanted)
    r = client.post(f"{API}/trades", json=body, headers=proposer["headers"])
    assert r.status_code in (200, 201), r.text
    return r.json()


def cards(names: dict[str, int]) -> list[dict]:
    return [{"creatureId": creature_id(n), "quantity": q} for n, q in names.items()]


def mat(items: list[dict]) -> list[tuple[str, int]]:
    return [(i["creature"]["name"], i["quantity"]) for i in items]


class LiveRoom:
    """Un joueur connecté à la salle d'échange : `init` est lu à l'entrée.

    `offer` et `ready` attendent l'échange à jour, et font lire la même diffusion aux autres
    joueurs connectés (`peers`) : chacun reste ainsi synchronisé sur le serveur.
    """

    def __init__(self, ws, peers: list["LiveRoom"]):
        self.ws = ws
        self.peers = peers
        self.init = ws.receive_json()
        assert self.init["type"] == "init", self.init
        self.trade = self.init["trade"]

    def send(self, **message) -> None:
        self.ws.send_json(message)

    def next(self, type_: str) -> dict:
        """Prochain message de ce type (les autres sont ignorés)."""
        while True:
            message = self.ws.receive_json()
            if message["type"] == "trade":
                self.trade = message["trade"]
            if message["type"] == type_:
                return message

    def _act(self, **message) -> dict:
        self.send(**message)
        trade = self.next("trade")["trade"]
        for peer in self.peers:
            if peer is not self:
                peer.next("trade")
        return trade

    def offer(self, names: dict[str, int]) -> dict:
        return self._act(type="offer", items=cards(names))

    def ready(self, ready: bool = True) -> dict:
        return self._act(type="ready", ready=ready)

    def error(self) -> dict:
        return self.next("error")["problem"]


_tables: dict[str, list[LiveRoom]] = {}


@contextmanager
def live(client: TestClient, player: dict, trade_id: str):
    token = player["tokens"]["accessToken"]
    peers = _tables.setdefault(trade_id, [])
    with client.websocket_connect(f"{API}/trades/{trade_id}/live?access_token={token}") as ws:
        room = LiveRoom(ws, peers)
        peers.append(room)
        try:
            yield room
        finally:
            peers.remove(room)


def conclude_trade(client: TestClient, a: dict, b: dict, offered: dict[str, int], requested: dict[str, int]) -> dict:
    """A ouvre un échange avec B, chacun pose ses cartes, puis les deux valident."""
    trade = open_trade(client, a, b)
    with live(client, a, trade["id"]) as room_a, live(client, b, trade["id"]) as room_b:
        room_a.offer(offered)
        room_b.offer(requested)
        room_a.ready()
        done = room_b.ready()
    assert done["status"] == "ACCEPTED", done
    return done
