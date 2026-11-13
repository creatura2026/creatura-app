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

    def online(self) -> list[str]:
        return sorted({str(seat.player_id) for seat in self.seats})

    def is_present(self, player_id: uuid.UUID) -> bool:
        return any(seat.player_id == player_id for seat in self.seats)


class TradeRooms:
    def __init__(self) -> None:
        self._rooms: dict[uuid.UUID, Room] = {}

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

    async def leave(self, trade_id: uuid.UUID, seat: Seat) -> None:
        """Sortie de la salle. La place est libérée tout de suite, sans attente : une sortie
        interrompue (arrêt du serveur, tâche annulée) ne laisse pas de joueur fantôme."""
        room = self._rooms.get(trade_id)
        if room is None:
            return
        room.seats.discard(seat)
        gone = not room.is_present(seat.player_id)
        self._forget_if_empty(trade_id)
        if gone and room.seats:
            presence = {"type": "presence", "playerId": str(seat.player_id), "online": False}
            task = asyncio.ensure_future(self.broadcast(set(room.seats), presence))
            _background.add(task)
            task.add_done_callback(_background.discard)
            await asyncio.shield(task)


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
