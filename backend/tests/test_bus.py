"""Bus entre les répliques (bus.py) : format des annonces, connexion d'écoute, émission au COMMIT."""

import itertools
import uuid

import psycopg
from conftest import TEST_DATABASE_URL
from sqlalchemy import text

from app import bus
from app.config import Settings
from app.database import SessionLocal


def test_notice_format_is_small_and_round_trips():
    notice = bus.Notice(trade_id=uuid.uuid4(), event=bus.CHAT, pod=bus.POD_ID, message_id=uuid.uuid4())
    payload = notice.encode()
    assert len(payload.encode()) < 200  # limite de PostgreSQL : environ 8000 octets
    assert bus.Notice.decode(payload) == notice
    assert bus.Notice.decode(bus.Notice(uuid.uuid4(), bus.TRADE, "autre").encode()).message_id is None
    # Illisible ou d'une autre version : ignorée.
    assert bus.Notice.decode("pas du JSON") is None
    assert bus.Notice.decode('{"v": 2, "p": "x", "t": "%s", "e": "trade"}' % uuid.uuid4()) is None
    assert bus.Notice.decode('{"v": 1, "p": "x", "t": "pas-un-uuid", "e": "trade"}') is None


def test_listener_connection_uses_url_password_without_iam():
    settings = Settings(database_url="postgres://creatura:secret@db.local:5433/creatura?sslmode=require", db_iam_auth=False)
    params = bus.connection_params(settings)
    assert (params["host"], params["port"], params["dbname"], params["user"]) == ("db.local", 5433, "creatura", "creatura")
    assert params["password"] == "secret" and params["sslmode"] == "require"
    assert params["application_name"] == bus.APPLICATION_NAME and params["autocommit"] is True


def test_listener_connection_signs_a_fresh_iam_token_each_time():
    """La connexion d'écoute dure longtemps : chaque reconnexion signe un nouveau jeton IAM
    (valable 15 min), jamais celui du démarrage."""
    settings = Settings(
        database_url="postgres://creatura_back@rds.local:5432/creatura?sslmode=require",
        db_iam_auth=True,
        aws_region="eu-north-1",
    )
    counter = itertools.count(1)
    token = lambda: f"jeton-{next(counter)}"  # noqa: E731
    assert bus.connection_params(settings, token)["password"] == "jeton-1"
    assert bus.connection_params(settings, token)["password"] == "jeton-2"
    assert bus.connection_params(settings, token)["user"] == "creatura_back"


def test_announcement_leaves_only_on_commit(_test_database):
    trade_id = uuid.uuid4()
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as listen:
        listen.execute(f"LISTEN {bus.CHANNEL}")

        # Transaction annulée : rien ne part.
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))  # transaction ouverte, comme une action de la salle
            bus.announce(db, trade_id, bus.TRADE)
            db.rollback()
            db.execute(text("SELECT 1"))
            db.commit()  # transaction suivante, sans annonce
        assert list(listen.notifies(timeout=0.5)) == []

        # Validée : une annonce, lisible, de ce processus.
        with SessionLocal() as db:
            bus.announce(db, trade_id, bus.UNAVAILABLE)
            db.commit()
        received = [bus.Notice.decode(n.payload) for n in listen.notifies(timeout=2, stop_after=1)]
        assert received == [bus.Notice(trade_id=trade_id, event=bus.UNAVAILABLE, pod=bus.POD_ID)]
