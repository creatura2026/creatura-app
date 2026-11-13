"""Salle d'échange servie par deux instances de l'API sur la même base, comme deux répliques.

Chaque instance est un vrai processus uvicorn : deux applications dans le processus des tests
partageraient les salles en mémoire, et le test ne prouverait rien. Un joueur est connecté à
chaque instance ; ce que l'un fait doit arriver chez l'autre en direct, sans reconnexion.

Chaque attente a un délai explicite, et un échec dit quel événement manque, chez qui et sur
quelle instance.
"""

import json
import os
import socket
import subprocess
import sys
import time
import uuid
from contextlib import ExitStack, contextmanager
from pathlib import Path

import httpx
import pytest
from conftest import PASSWORD, cards, creature_id, give, mat, reset_database
from sqlalchemy import text
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

from app.controllers import collection
from app.database import SessionLocal

BACKEND_DIR = Path(__file__).resolve().parents[1]

STARTUP_TIMEOUT = 20.0  # démarrage d'une instance (réponse de /api/v1/health)
LISTEN_TIMEOUT = 20.0  # les deux instances écoutent le canal du bus
RECEIVE_TIMEOUT = 5.0  # un message attendu sur un WebSocket
RESYNC_TIMEOUT = 15.0  # reconnexion de l'écoute (attente de 1 s environ) puis renvoi de l'état
SILENCE_WINDOW = 1.0  # fenêtre pendant laquelle un message ne doit PAS arriver (doublon)

LISTENERS_SQL = """
    SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database() AND application_name LIKE 'creatura-bus:%'
      AND (query ILIKE 'LISTEN%' OR query = 'SELECT 1')
"""


# ── Instances de l'API ───────────────────────────────────────────────────────


class Server:
    def __init__(self, name: str, port: int, log: Path, process: subprocess.Popen):
        self.name, self.port, self.log, self.process = name, port, log, process
        self.api = f"http://127.0.0.1:{port}/api/v1"
        self.ws = f"ws://127.0.0.1:{port}/api/v1"

    def log_tail(self, lines: int = 40) -> str:
        try:
            return "\n".join(self.log.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])
        except OSError:
            return "(journal illisible)"

    def wait_ready(self) -> None:
        deadline = time.monotonic() + STARTUP_TIMEOUT
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                pytest.fail(
                    f"Le {self.name} s'est arrêté au démarrage (code {self.process.returncode}) :\n{self.log_tail()}"
                )
            try:
                if httpx.get(f"{self.api}/health", timeout=1.0).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        pytest.fail(f"Le {self.name} ne répond pas sur /api/v1/health après {STARTUP_TIMEOUT:.0f} s :\n{self.log_tail()}")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextmanager
def _run_server(name: str, log_dir: Path):
    port = _free_port()
    log = log_dir / f"{name.replace(' ', '-')}.log"
    # Même environnement que les tests (base creatura_test, JWT_SECRET…) : conftest l'a préparé.
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    with log.open("w", encoding="utf-8") as out:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=BACKEND_DIR,
            env=env,
            stdout=out,
            stderr=subprocess.STDOUT,
        )
    server = Server(name, port, log, process)
    try:
        server.wait_ready()
        yield server
    finally:
        process.terminate()
        try:
            process.wait(10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def _listeners() -> int:
    with SessionLocal() as db:
        return db.scalar(text(LISTENERS_SQL))


def _wait_listeners(count: int, servers: list[Server]) -> None:
    deadline = time.monotonic() + LISTEN_TIMEOUT
    while time.monotonic() < deadline:
        if _listeners() >= count:
            return
        time.sleep(0.2)
    logs = "\n".join(f"--- {s.name}\n{s.log_tail(15)}" for s in servers)
    pytest.fail(f"{_listeners()} instance(s) sur {count} écoutent le bus après {LISTEN_TIMEOUT:.0f} s :\n{logs}")


@pytest.fixture
def two_servers(_test_database, tmp_path):
    reset_database()
    with ExitStack() as stack:
        servers = [stack.enter_context(_run_server(name, tmp_path)) for name in ("serveur 1", "serveur 2")]
        _wait_listeners(2, servers)
        yield servers


# ── Joueurs et salles ────────────────────────────────────────────────────────


def register(server: Server, pseudo: str) -> dict:
    r = httpx.post(
        f"{server.api}/auth/register",
        json={"pseudo": pseudo, "login": pseudo.lower(), "password": PASSWORD},
        timeout=RECEIVE_TIMEOUT,
    )
    assert r.status_code == 201, f"inscription de {pseudo} sur le {server.name} : {r.text}"
    r = httpx.post(
        f"{server.api}/auth/login", json={"login": pseudo.lower(), "password": PASSWORD}, timeout=RECEIVE_TIMEOUT
    )
    assert r.status_code == 200, f"connexion de {pseudo} sur le {server.name} : {r.text}"
    token = r.json()["accessToken"]
    return {"pseudo": pseudo, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


def player_id(server: Server, player: dict) -> uuid.UUID:
    r = httpx.get(f"{server.api}/me", headers=player["headers"], timeout=RECEIVE_TIMEOUT)
    assert r.status_code == 200, r.text
    return uuid.UUID(r.json()["id"])


def open_trade(server: Server, proposer: dict, recipient_id: uuid.UUID) -> dict:
    r = httpx.post(
        f"{server.api}/trades", json={"recipientId": str(recipient_id)}, headers=proposer["headers"], timeout=RECEIVE_TIMEOUT
    )
    assert r.status_code in (200, 201), f"ouverture de l'échange sur le {server.name} : {r.text}"
    return r.json()


def _summary(message: dict) -> str:
    if message.get("type") == "trade":
        t = message["trade"]
        return f"trade({t['status']}, offert={mat(t['offered'])}, demandé={mat(t['requested'])})"
    if message.get("type") == "chat":
        return f"chat({message['message']['text']!r})"
    if message.get("type") == "error":
        return f"error({message['problem']['code']})"
    return str(message.get("type"))


class Live:
    """Un joueur dans la salle, connecté à une instance précise."""

    def __init__(self, player: dict, server: Server, trade_id: str):
        self.who = f"{player['pseudo']} sur le {server.name}"
        url = f"{server.ws}/trades/{trade_id}/live?access_token={player['token']}"
        self._stack = ExitStack()
        try:
            self.ws = self._stack.enter_context(connect(url, open_timeout=RECEIVE_TIMEOUT, close_timeout=1))
        except Exception as exc:  # refus d'ouverture, instance injoignable…
            pytest.fail(f"Entrée dans la salle impossible pour {self.who} : {exc!r}")
        self.init = self.expect("init", "entrée dans la salle")

    def send(self, **message) -> None:
        self.ws.send(json.dumps(message))

    def expect(self, type_: str, what: str, timeout: float = RECEIVE_TIMEOUT, where=lambda m: True) -> dict:
        """Prochain message `type_` qui vérifie `where` ; les autres sont notés et ignorés."""
        deadline = time.monotonic() + timeout
        seen: list[str] = []
        while (remaining := deadline - time.monotonic()) > 0:
            try:
                message = json.loads(self.ws.recv(timeout=remaining))
            except TimeoutError:
                break
            except ConnectionClosed as exc:
                pytest.fail(f"{what} : connexion de {self.who} fermée en attendant `{type_}` ({exc}) ; reçus : {seen}")
            if message.get("type") == type_ and where(message):
                return message
            seen.append(_summary(message))
        pytest.fail(f"{what} : `{type_}` non reçu par {self.who} en {timeout:.0f} s (reçus entre-temps : {seen or 'rien'})")

    def expect_silence(self, type_: str, what: str, window: float = SILENCE_WINDOW) -> None:
        """Aucun message `type_` pendant `window` secondes."""
        deadline = time.monotonic() + window
        while (remaining := deadline - time.monotonic()) > 0:
            try:
                message = json.loads(self.ws.recv(timeout=remaining))
            except TimeoutError:
                return
            if message.get("type") == type_:
                pytest.fail(f"{what} : `{type_}` inattendu reçu par {self.who} : {_summary(message)}")

    def close(self) -> None:
        self._stack.close()


@contextmanager
def live(player: dict, server: Server, trade_id: str):
    room = Live(player, server, trade_id)
    try:
        yield room
    finally:
        room.close()


def _setup(servers: list[Server]) -> tuple[Server, Server, dict, dict, dict]:
    """Alice (serveur 1) ouvre un échange avec Bob (serveur 2) : Moussou contre Brumel."""
    s1, s2 = servers
    alice, bob = register(s1, "Alice"), register(s2, "Bob")
    alice["id"], bob["id"] = player_id(s1, alice), player_id(s2, bob)
    give(alice["id"], "Moussou", 1)
    give(bob["id"], "Brumel", 1)
    return s1, s2, alice, bob, open_trade(s1, alice, bob["id"])


# ── Tests ────────────────────────────────────────────────────────────────────


def test_chat_and_trade_reach_the_other_server(two_servers):
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a, live(bob, s2, trade["id"]) as b:
        # Discussion, dans les deux sens : une seule fois, avec le même identifiant.
        a.send(type="chat", text="Salut Bob, ton Brumel ?")
        sent = a.expect("chat", "message d'Alice (sur son propre serveur)")["message"]
        got = b.expect("chat", "message d'Alice")["message"]
        assert got["id"] == sent["id"] and got["text"] == "Salut Bob, ton Brumel ?"
        b.expect_silence("chat", "message d'Alice en double")

        b.send(type="chat", text="D'accord !")
        b.expect("chat", "message de Bob (sur son propre serveur)")
        assert a.expect("chat", "réponse de Bob")["message"]["text"] == "D'accord !"
        a.expect_silence("chat", "réponse de Bob en double")

        # Tapis : chacun voit celui de l'autre.
        b.send(type="offer", items=cards({"Brumel": 1}))
        b.expect("trade", "tapis de Bob (sur son propre serveur)")
        seen = a.expect("trade", "tapis de Bob", where=lambda m: m["trade"]["requested"])["trade"]
        assert mat(seen["requested"]) == [("Brumel", 1)]

        a.send(type="offer", items=cards({"Moussou": 1}))
        a.expect("trade", "tapis d'Alice (sur son propre serveur)")
        seen = b.expect("trade", "tapis d'Alice", where=lambda m: m["trade"]["offered"])["trade"]
        assert mat(seen["offered"]) == [("Moussou", 1)]

        # Validations croisées, puis conclusion vue des deux côtés.
        a.send(type="ready", ready=True)
        a.expect("trade", "validation d'Alice (sur son propre serveur)")
        b.expect("trade", "validation d'Alice", where=lambda m: m["trade"]["proposerReady"])

        b.send(type="ready", ready=True)
        done = b.expect("trade", "conclusion par Bob (sur son propre serveur)")["trade"]
        assert done["status"] == "ACCEPTED", done
        a.expect("trade", "conclusion par Bob", where=lambda m: m["trade"]["status"] == "ACCEPTED")


def test_card_gone_is_reported_on_both_servers(two_servers):
    """La carte de Bob disparaît hors de la salle : quand Alice valide (serveur 1), Bob (serveur 2)
    reçoit le tapis rogné et l'erreur CARDS_UNAVAILABLE, comme s'il était sur le même serveur."""
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a, live(bob, s2, trade["id"]) as b:
        a.send(type="offer", items=cards({"Moussou": 1}))
        b.expect("trade", "tapis d'Alice", where=lambda m: m["trade"]["offered"])
        b.send(type="offer", items=cards({"Brumel": 1}))
        a.expect("trade", "tapis de Bob", where=lambda m: m["trade"]["requested"])

        with SessionLocal() as db:  # Bob n'a plus son Brumel (échangé ailleurs, par exemple)
            assert collection.remove_cards(db, bob["id"], int(creature_id("Brumel")), 1)
            db.commit()

        a.send(type="ready", ready=True)
        assert a.expect("error", "carte indisponible (sur le serveur d'Alice)")["problem"]["code"] == "CARDS_UNAVAILABLE"
        trimmed = b.expect("trade", "tapis rogné après la validation d'Alice", where=lambda m: not m["trade"]["requested"])
        assert mat(trimmed["trade"]["offered"]) == [("Moussou", 1)] and trimmed["trade"]["proposerReady"] is False
        assert b.expect("error", "carte indisponible")["problem"]["code"] == "CARDS_UNAVAILABLE"


def test_refusal_and_cancellation_sent_to_the_other_server(two_servers):
    """Abandon par une route HTTP traitée par l'autre instance que celle de la salle."""
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a:
        r = httpx.post(f"{s2.api}/trades/{trade['id']}/refuse", headers=bob["headers"], timeout=RECEIVE_TIMEOUT)
        assert r.status_code == 200, r.text
        a.expect("trade", "refus de Bob envoyé au serveur 2", where=lambda m: m["trade"]["status"] == "REFUSED")

    second = open_trade(s1, alice, bob["id"])
    with live(bob, s1, second["id"]) as b:
        r = httpx.post(f"{s2.api}/trades/{second['id']}/cancel", headers=alice["headers"], timeout=RECEIVE_TIMEOUT)
        assert r.status_code == 200, r.text
        b.expect("trade", "annulation d'Alice envoyée au serveur 2", where=lambda m: m["trade"]["status"] == "CANCELLED")


def test_listener_reconnects_and_resends_full_state(two_servers):
    """La connexion d'écoute est coupée sur les deux instances : chacune se reconnecte seule et
    renvoie l'état complet (`init`) à ses joueurs, sans qu'ils rouvrent leur WebSocket. Le bus
    fonctionne ensuite comme avant."""
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a, live(bob, s2, trade["id"]) as b:
        with SessionLocal() as db:
            killed = db.scalar(
                text(
                    "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND application_name LIKE 'creatura-bus:%'"
                )
            )
        assert killed == 2, f"{killed} connexion(s) d'écoute coupée(s) au lieu de 2"

        a.expect("init", "état complet après la reconnexion de l'écoute du serveur 1", timeout=RESYNC_TIMEOUT)
        b.expect("init", "état complet après la reconnexion de l'écoute du serveur 2", timeout=RESYNC_TIMEOUT)
        _wait_listeners(2, two_servers)

        b.send(type="chat", text="Toujours là ?")
        b.expect("chat", "message de Bob après la reconnexion (sur son propre serveur)")
        assert a.expect("chat", "message de Bob après la reconnexion")["message"]["text"] == "Toujours là ?"


# ── Présence entre instances ─────────────────────────────────────────────────

PRUNE_TIMEOUT = 45.0  # processus tué : retiré à la vérification suivante (toutes les 30 s)


def _sees_online(room: Live, player_id: uuid.UUID, what: str, timeout: float = RECEIVE_TIMEOUT) -> None:
    """`player_id` est en ligne pour `room` : dans son `init`, ou par un `presence` qui suit."""
    if str(player_id) in room.init["online"]:
        return
    room.expect(
        "presence",
        what,
        timeout=timeout,
        where=lambda m: m["playerId"] == str(player_id) and m["online"] is True,
    )


def test_presence_is_shared_between_servers(two_servers):
    """Chacun voit l'autre en ligne, puis hors ligne quand il quitte la salle."""
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a:
        with live(bob, s2, trade["id"]) as b:
            _sees_online(a, bob["id"], "Bob entré sur le serveur 2")
            _sees_online(b, alice["id"], "Alice déjà présente sur le serveur 1")
        a.expect(
            "presence",
            "Bob sorti du serveur 2",
            where=lambda m: m["playerId"] == str(bob["id"]) and m["online"] is False,
        )
        # Bob revient : de nouveau en ligne pour Alice.
        with live(bob, s2, trade["id"]) as b:
            _sees_online(a, bob["id"], "Bob revenu sur le serveur 2")
            assert str(alice["id"]) in b.init["online"], "Alice absente de l'init de Bob au retour"


def test_killed_server_players_go_offline(two_servers):
    """Le serveur 2 est tué sans prévenir : Bob passe hors ligne pour Alice (serveur 1) dès la
    vérification suivante des processus disparus."""
    s1, s2, alice, bob, trade = _setup(two_servers)
    with live(alice, s1, trade["id"]) as a:
        b = Live(bob, s2, trade["id"])
        _sees_online(a, bob["id"], "Bob entré sur le serveur 2")
        s2.process.kill()
        s2.process.wait(10)
        a.expect(
            "presence",
            "Bob hors ligne après l'arrêt brutal du serveur 2",
            timeout=PRUNE_TIMEOUT,
            where=lambda m: m["playerId"] == str(bob["id"]) and m["online"] is False,
        )
        try:
            b.close()
        except Exception:
            pass
