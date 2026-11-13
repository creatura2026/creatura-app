"""Bus entre les répliques de l'API : PostgreSQL LISTEN/NOTIFY sur le canal `creatura_trades`.

Les salles d'échange sont tenues en mémoire par chaque processus (`realtime.py`). Avec plusieurs
répliques, les deux joueurs d'un échange peuvent être servis par deux processus différents : une
action est donc aussi annoncée aux autres processus, qui relisent la base et préviennent leurs
propres connexions.

Émission : `announce(db, …)` note l'événement dans la session ; juste avant le COMMIT, il devient un
`pg_notify` de la même transaction. PostgreSQL ne le délivre qu'une fois la transaction validée, et
jamais si elle échoue : un processus qui reçoit l'annonce relit toujours des données écrites.

Charge minimale (la limite de PostgreSQL est d'environ 8000 octets) : jamais l'échange lui-même,
seulement de quoi le relire. `{"v":1,"p":<processus>,"t":<échange>,"e":<événement>,"m":<message>}`
(`"u":<joueur>` pour la présence).

Écoute : un thread ouvre une connexion dédiée (hors du pool) et fait LISTEN. Les annonces des
autres processus sont transmises une par une, dans l'ordre d'arrivée, au gestionnaire enregistré
avec `listener.subscribe`, dans la boucle d'événements de l'application. Si la connexion tombe :
reconnexion avec une attente croissante, puis `on_reconnect` (les annonces manquées sont perdues :
la salle renvoie alors son état complet).

Un thread plutôt que psycopg asynchrone : celui-ci ne fonctionne pas avec la boucle d'événements par
défaut de Windows (postes de développement, tests).
"""

import asyncio
import json
import logging
import random
import threading
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import psycopg
from sqlalchemy import event, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

CHANNEL = "creatura_trades"
VERSION = 1
# Identifiant de ce processus : ses propres annonces lui reviennent et sont ignorées.
POD_ID = uuid.uuid4().hex[:12]
APPLICATION_NAME = f"creatura-bus:{POD_ID}"

# Événements d'une salle : un message de la discussion, l'échange a changé, l'échange a changé
# parce qu'une carte posée n'est plus disponible (les deux joueurs sont prévenus).
CHAT, TRADE, UNAVAILABLE = "chat", "trade", "unavailable"
# Présence : un joueur entre dans la salle sur ce processus (les autres répondent HERE pour leurs
# propres joueurs), y est déjà (réponse, sans réponse en retour), ou n'y a plus aucune connexion.
JOIN, HERE, LEAVE = "join", "here", "leave"

_PENDING = "creatura_bus_pending"  # clé de Session.info : annonces de la transaction en cours

# Attente avant la reconnexion n° `attempt` : 1 s, 2 s, 4 s… jusqu'à 30 s, avec ±20 % d'aléa
# (les répliques ne se reconnectent pas toutes en même temps après une coupure de la base).
RETRY_MAX_SECONDS = 30.0
# Durée d'une attente de notifications : le thread vérifie entre deux s'il doit s'arrêter.
POLL_SECONDS = 0.5
# Sans notification depuis ce temps, la connexion est vérifiée (`SELECT 1`).
HEALTH_SECONDS = 30.0
# Fréquence de la vérification des processus disparus sans prévenir (présence fantôme).
TICK_SECONDS = 30.0


@dataclass(frozen=True)
class Notice:
    trade_id: uuid.UUID
    event: str
    pod: str
    message_id: uuid.UUID | None = None
    player_id: uuid.UUID | None = None

    def encode(self) -> str:
        data = {"v": VERSION, "p": self.pod, "t": str(self.trade_id), "e": self.event}
        if self.message_id is not None:
            data["m"] = str(self.message_id)
        if self.player_id is not None:
            data["u"] = str(self.player_id)
        return json.dumps(data, separators=(",", ":"))

    @classmethod
    def decode(cls, payload: str) -> "Notice | None":
        """Annonce lue sur le canal ; None si elle est illisible ou d'une autre version."""
        try:
            data = json.loads(payload)
            if data.get("v") != VERSION:
                return None
            message, player = data.get("m"), data.get("u")
            return cls(
                trade_id=uuid.UUID(data["t"]),
                event=str(data["e"]),
                pod=str(data["p"]),
                message_id=uuid.UUID(message) if message else None,
                player_id=uuid.UUID(player) if player else None,
            )
        except (ValueError, KeyError, TypeError, AttributeError):
            return None


# ── Émission ─────────────────────────────────────────────────────────────────


def announce(db: Session, trade_id: uuid.UUID, event_: str, message_id: uuid.UUID | None = None) -> None:
    """Annonce un événement de salle aux autres processus, au COMMIT de la transaction en cours."""
    notice = Notice(trade_id=trade_id, event=event_, pod=POD_ID, message_id=message_id)
    db.info.setdefault(_PENDING, []).append(notice.encode())


def publish(db: Session, trade_id: uuid.UUID, event_: str, player_id: uuid.UUID) -> None:
    """Annonce de présence, envoyée tout de suite (transaction courte, sans autre écriture)."""
    notice = Notice(trade_id=trade_id, event=event_, pod=POD_ID, player_id=player_id)
    db.execute(select(func.pg_notify(CHANNEL, notice.encode())))
    db.commit()


def live_pods(db: Session) -> set[str]:
    """Processus dont la connexion d'écoute est ouverte (vus dans pg_stat_activity : tous les
    processus de l'API se connectent avec le même utilisateur, chacun voit donc les autres)."""
    prefix = APPLICATION_NAME.split(":")[0] + ":"
    names = db.scalars(
        text("SELECT application_name FROM pg_stat_activity WHERE application_name LIKE :p"), {"p": prefix + "%"}
    )
    return {name.removeprefix(prefix) for name in names}


def install(factory: sessionmaker) -> None:
    """Branche l'émission sur les sessions de `factory` (appelé une fois, par database.py)."""

    @event.listens_for(factory, "before_commit")
    def _emit(session: Session) -> None:
        for payload in session.info.pop(_PENDING, []):
            session.execute(select(func.pg_notify(CHANNEL, payload)))

    @event.listens_for(factory, "after_soft_rollback")
    def _forget(session: Session, previous_transaction) -> None:
        session.info.pop(_PENDING, None)


# ── Connexion d'écoute ───────────────────────────────────────────────────────


def connection_params(settings: Settings, token: Callable[[], str] | None = None) -> dict:
    """Paramètres d'une nouvelle connexion d'écoute, avec des identifiants à jour.

    Même authentification que le pool (database.py) : avec DB_IAM_AUTH, le mot de passe est un
    jeton IAM signé à cet instant (il ne sert qu'à ouvrir la connexion, qui reste valide ensuite) ;
    sinon, le mot de passe de DATABASE_URL.
    """
    url = make_url(settings.database_url)
    params: dict = {
        "host": url.host,
        "port": url.port or 5432,
        "dbname": url.database,
        "user": url.username,
        "application_name": APPLICATION_NAME,
        "autocommit": True,
        "connect_timeout": 10,
        # Une connexion morte (nœud perdu, coupure réseau) est détectée en une minute environ.
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
    }
    for key, value in url.query.items():  # sslmode=require…
        params[key] = value if isinstance(value, str) else value[-1]
    if settings.db_iam_auth:
        if token is None:
            raise RuntimeError("DB_IAM_AUTH=true : fournisseur de jeton IAM manquant")
        params["password"] = token()
    elif url.password is not None:
        params["password"] = url.password
    return params


def retry_delay(attempt: int) -> float:
    return min(2.0 ** (attempt - 1), RETRY_MAX_SECONDS) * random.uniform(0.8, 1.2)


Handler = Callable[[Notice], Awaitable[None]]
Resync = Callable[[], Awaitable[None]]
Tick = Callable[[], Awaitable[None]]
_RESYNC = object()  # dans la file : renvoyer l'état complet des salles
_TICK = object()  # dans la file : vérification périodique (processus disparus)


class Listener:
    def __init__(self) -> None:
        self._handler: Handler | None = None
        self._on_reconnect: Resync | None = None
        self._on_tick: Tick | None = None
        self._thread: threading.Thread | None = None
        self._worker: asyncio.Task | None = None
        self._stop = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue | None = None
        self.listening = threading.Event()  # LISTEN actif (diagnostic, tests)

    def subscribe(self, handler: Handler, on_reconnect: Resync, on_tick: Tick | None = None) -> None:
        self._handler, self._on_reconnect, self._on_tick = handler, on_reconnect, on_tick

    async def start(self) -> None:
        if self._thread is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue()
        self._stop.clear()
        self._worker = asyncio.create_task(self._work(), name="creatura-bus")
        self._thread = threading.Thread(target=self._run, name="creatura-bus", daemon=True)
        self._thread.start()

    async def stop(self) -> None:
        if self._thread is None:
            return
        self._stop.set()
        await asyncio.to_thread(self._thread.join, 5)
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
        self._thread = self._worker = self._queue = self._loop = None
        self.listening.clear()

    # Dans la boucle d'événements : une annonce à la fois, dans l'ordre d'arrivée.
    async def _work(self) -> None:
        assert self._queue is not None
        while True:
            item = await self._queue.get()
            try:
                if item is _RESYNC:
                    if self._on_reconnect is not None:
                        await self._on_reconnect()
                elif item is _TICK:
                    if self._on_tick is not None:
                        await self._on_tick()
                elif self._handler is not None:
                    await self._handler(item)
            except Exception:
                log.exception("Annonce du bus non traitée : %r", item)

    def _push(self, item) -> None:
        loop, queue = self._loop, self._queue
        if loop is None or queue is None:
            return
        try:
            loop.call_soon_threadsafe(queue.put_nowait, item)
        except RuntimeError:  # boucle déjà fermée (arrêt de l'application)
            pass

    # Dans le thread : connexion, LISTEN, réception ; reconnexion si elle tombe.
    def _run(self) -> None:
        settings = get_settings()
        token = None
        attempt = 0
        while not self._stop.is_set():
            try:
                if settings.db_iam_auth and token is None:
                    from app.database import rds_iam_token_provider  # import tardif : database importe bus

                    token = rds_iam_token_provider(settings)
                with psycopg.connect(**connection_params(settings, token)) as conn:
                    conn.execute(f"LISTEN {CHANNEL}")
                    if attempt:
                        log.info("Bus de la salle d'échange reconnecté (processus %s)", POD_ID)
                    attempt = 0
                    self.listening.set()
                    # Ce qui a été annoncé avant ce LISTEN est perdu : les salles renvoient leur état.
                    self._push(_RESYNC)
                    self._listen(conn)
            except Exception as exc:
                if self._stop.is_set():
                    break
                attempt += 1
                delay = retry_delay(attempt)
                log.warning(
                    "Bus de la salle d'échange indisponible (%s) : nouvelle tentative dans %.1f s", exc, delay
                )
            finally:
                self.listening.clear()
            if attempt:
                self._stop.wait(delay)

    def _listen(self, conn: psycopg.Connection) -> None:
        last_seen = last_tick = time.monotonic()
        while not self._stop.is_set():
            if time.monotonic() - last_tick > TICK_SECONDS:
                last_tick = time.monotonic()
                self._push(_TICK)
            for notify in conn.notifies(timeout=POLL_SECONDS):
                last_seen = time.monotonic()
                notice = Notice.decode(notify.payload)
                if notice is None or notice.pod == POD_ID:
                    continue  # illisible, ou annonce de ce processus (déjà diffusée ici)
                self._push(notice)
            if time.monotonic() - last_seen > HEALTH_SECONDS:
                conn.execute("SELECT 1")  # lève une erreur si la connexion est morte
                last_seen = time.monotonic()


listener = Listener()
