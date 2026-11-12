"""Salles d'échange en temps réel : les connexions WebSocket ouvertes, par échange.

Tenues en mémoire par ce processus : l'API doit tourner en une seule réplique (ou avec des
sessions collantes par échange) tant qu'aucun bus de messages ne relie les répliques.

Chaque salle a un verrou : une action (ou une diffusion après un refus, une annulation…)
s'applique puis se diffuse avant la suivante. Les deux joueurs voient donc les événements
dans le même ordre, et le dernier `trade` reçu est toujours l'état de la base.
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
