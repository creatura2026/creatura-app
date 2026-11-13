"""Salles d'échange en temps réel : les connexions WebSocket ouvertes, par échange.

Tenues en mémoire par ce processus. Avec plusieurs répliques de l'API, les deux joueurs d'un
échange peuvent être servis par deux processus : chaque action est aussi annoncée aux autres
processus par PostgreSQL LISTEN/NOTIFY (`bus.py`), qui relisent la base et préviennent leurs
propres connexions. Si l'écoute est coupée, chaque salle reçoit son état complet à la reprise.

Ordre des événements :
- dans un processus, chaque salle a un verrou : une action (ou une diffusion après un refus,
  une annulation, une annonce d'un autre processus…) s'applique puis se diffuse avant la
  suivante. Les connexions d'un même processus voient les événements dans le même ordre ;
- entre processus, les actions sur un échange sont sérialisées par la base (SELECT … FOR UPDATE),
  les annonces arrivent après le COMMIT, dans l'ordre des COMMIT, et chaque processus les traite
  une par une en relisant la base. Les états `trade` reçus par un joueur ne reculent donc jamais
  et le dernier est l'état de la base. En revanche, deux actions *simultanées* des deux joueurs,
  traitées par deux processus, peuvent apparaître dans un ordre différent sur les deux écrans.
"""

import asyncio
import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field

from fastapi import WebSocket

log = logging.getLogger(__name__)
# Diffusions lancées hors de la tâche de la connexion (gardées ici jusqu'à leur fin).
_background: set[asyncio.Future] = set()


@dataclass(eq=False)
class Seat:
    """Une connexion : un joueur peut en ouvrir plusieurs (plusieurs onglets)."""

    websocket: WebSocket
    player_id: uuid.UUID


@dataclass(eq=False)
class Room:
    seats: set[Seat] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    users: int = 0  # tâches qui utilisent la salle (verrou pris ou attendu)

    def players(self) -> set[uuid.UUID]:
        """Joueurs connectés à cette salle sur ce processus."""
        return {seat.player_id for seat in self.seats}

    def is_present(self, player_id: uuid.UUID) -> bool:
        """Le joueur a au moins une connexion à cette salle sur ce processus."""
        return any(seat.player_id == player_id for seat in self.seats)


class TradeRooms:
    def __init__(self) -> None:
        self._rooms: dict[uuid.UUID, Room] = {}
        # Joueurs présents dans une salle sur les AUTRES processus : échange → processus → joueurs.
        # Tenu même sans connexion locale, pour qu'une entrée ici connaisse tout de suite les autres.
        self._remote: dict[uuid.UUID, dict[str, set[uuid.UUID]]] = {}

    # ── Présence, tous processus confondus ──

    def _remote_players(self, trade_id: uuid.UUID) -> set[uuid.UUID]:
        return set().union(*self._remote.get(trade_id, {}).values())

    def online(self, trade_id: uuid.UUID) -> list[str]:
        """Joueurs présents dans la salle, ici ou sur un autre processus."""
        room = self._rooms.get(trade_id)
        here = room.players() if room else set()
        return sorted(str(p) for p in here | self._remote_players(trade_id))

    def is_online(self, trade_id: uuid.UUID, player_id: uuid.UUID) -> bool:
        room = self._rooms.get(trade_id)
        return (room is not None and room.is_present(player_id)) or player_id in self._remote_players(trade_id)

    def remote_join(self, trade_id: uuid.UUID, pod: str, player_id: uuid.UUID) -> bool:
        """Un joueur est présent sur le processus `pod`. Vrai s'il n'était présent nulle part."""
        was_online = self.is_online(trade_id, player_id)
        self._remote.setdefault(trade_id, {}).setdefault(pod, set()).add(player_id)
        return not was_online

    def remote_leave(self, trade_id: uuid.UUID, pod: str, player_id: uuid.UUID) -> bool:
        """Le joueur n'est plus sur le processus `pod`. Vrai s'il n'est plus présent nulle part."""
        pods = self._remote.get(trade_id, {})
        players = pods.get(pod)
        if not players or player_id not in players:
            return False
        players.discard(player_id)
        if not players:
            del pods[pod]
        if not pods:
            self._remote.pop(trade_id, None)
        return not self.is_online(trade_id, player_id)

    def remote_pods(self) -> set[str]:
        return {pod for pods in self._remote.values() for pod in pods}

    def forget_pods(self, pods: set[str]) -> list[tuple[uuid.UUID, uuid.UUID]]:
        """Oublie la présence des processus `pods` (disparus) ; renvoie les (échange, joueur) qui ne
        sont plus présents nulle part."""
        gone = []
        for trade_id, by_pod in list(self._remote.items()):
            for pod in pods & by_pod.keys():
                for player_id in list(by_pod[pod]):
                    if self.remote_leave(trade_id, pod, player_id):
                        gone.append((trade_id, player_id))
        return gone

    def forget_remote(self) -> None:
        """Présence des autres processus inconnue (écoute coupée) : elle sera réapprise."""
        self._remote.clear()

    def get(self, trade_id: uuid.UUID) -> Room | None:
        return self._rooms.get(trade_id)

    def open_trades(self) -> list[uuid.UUID]:
        """Échanges qui ont une salle sur ce processus."""
        return list(self._rooms)

    def use(self, trade_id: uuid.UUID) -> "_RoomUse":
        """`async with rooms.use(id) as room:` : la salle, verrouillée pendant le bloc."""
        return _RoomUse(self, trade_id)

    def _forget_if_empty(self, trade_id: uuid.UUID) -> None:
        room = self._rooms.get(trade_id)
        if room is not None and not room.seats and not room.users:
            del self._rooms[trade_id]

    @staticmethod
    async def send(seat: Seat, message: dict) -> None:
        try:
            await seat.websocket.send_json(message)
        except Exception:  # connexion déjà fermée : elle sortira de la salle d'elle-même
            log.debug("Envoi impossible dans la salle d'échange", exc_info=True)

    async def broadcast(self, seats: Iterable[Seat], message: dict) -> None:
        await asyncio.gather(*(self.send(seat, message) for seat in list(seats)))

    async def leave(self, trade_id: uuid.UUID, seat: Seat) -> bool:
        """Sortie de la salle. La place est libérée tout de suite, sans attente : une sortie
        interrompue (arrêt du serveur, tâche annulée) ne laisse pas de joueur fantôme.

        Vrai si le joueur n'a plus aucune connexion à cette salle sur ce processus (les autres
        processus doivent alors en être prévenus)."""
        room = self._rooms.get(trade_id)
        if room is None:
            return False
        room.seats.discard(seat)
        left_here = not room.is_present(seat.player_id)
        gone = not self.is_online(trade_id, seat.player_id)
        self._forget_if_empty(trade_id)
        if gone and room.seats:
            presence = {"type": "presence", "playerId": str(seat.player_id), "online": False}
            task = asyncio.ensure_future(self.broadcast(set(room.seats), presence))
            _background.add(task)
            task.add_done_callback(_background.discard)
            await asyncio.shield(task)
        return left_here


class _RoomUse:
    def __init__(self, rooms: TradeRooms, trade_id: uuid.UUID):
        self.rooms, self.trade_id = rooms, trade_id

    async def __aenter__(self) -> Room:
        self.room = self.rooms._rooms.setdefault(self.trade_id, Room())
        self.room.users += 1
        try:
            await self.room.lock.acquire()
        except BaseException:
            self.room.users -= 1
            raise
        return self.room

    async def __aexit__(self, *exc) -> None:
        self.room.lock.release()
        self.room.users -= 1
        self.rooms._forget_if_empty(self.trade_id)


rooms = TradeRooms()
