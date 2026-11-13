"""Échanges — UC-09, UC-10, UC-11 : salle d'échange (WebSocket), abandon et historique."""

import logging
import uuid
from typing import Callable, TypeVar

from fastapi import APIRouter, Response, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app import bus
from app.controllers import trade
from app.database import SessionLocal
from app.dependencies import CurrentUser, DbSession, Pagination, user_from_token
from app.errors import DomainError, NotFound, Unauthorized, problem_body
from app.models import EchangeMessage, Utilisateur
from app.realtime import Room, Seat, rooms
from app.schemas.base import Page
from app.schemas.trade import (
    STATUT_OF,
    TradeChatCommand,
    TradeCreateIn,
    TradeMessageOut,
    TradeOfferCommand,
    TradeOut,
    TradeRole,
    TradeStatus,
    client_message,
)
from app.security import ACCESS
from app.validation import validation_problem

router = APIRouter(prefix="/trades", tags=["Échanges"])
log = logging.getLogger(__name__)
T = TypeVar("T")


# ── Accès à la base depuis le code asynchrone ────────────────────────────────


def _in_session(fn: Callable[..., T], *args) -> T:
    with SessionLocal() as db:
        return fn(db, *args)


async def _db(fn: Callable[..., T], *args) -> T:
    """Exécute `fn(db, *args)` dans une session courte, hors de la boucle d'événements."""
    return await run_in_threadpool(_in_session, fn, *args)


def _as_player(db: Session, player_id: uuid.UUID, fn: Callable[..., T], *args) -> T:
    me = db.get(Utilisateur, player_id)
    if me is None:
        raise Unauthorized("Compte introuvable, reconnectez-vous.")
    return fn(db, me, *args)


def _trade_json(db: Session, trade_id: uuid.UUID) -> dict:
    return TradeOut.of(trade.load(db, trade_id)).model_dump(mode="json")


async def _push_trade(trade_id: uuid.UUID, room: Room) -> None:
    """Diffuse l'état de l'échange tel qu'il est en base."""
    await rooms.broadcast(room.seats, {"type": "trade", "trade": await _db(_trade_json, trade_id)})


def _cards_unavailable() -> DomainError:
    return DomainError(
        "Une carte posée n'est plus disponible : elle a été retirée du tapis. "
        "Vérifiez l'échange avant de valider.",
        "CARDS_UNAVAILABLE",
    )


async def notify_room(trade_id: uuid.UUID) -> None:
    """L'échange a changé hors de la salle (ouverture, refus, annulation) : la salle est prévenue."""
    if rooms.get(trade_id) is None:
        return
    async with rooms.use(trade_id) as room:
        if room.seats:
            await _push_trade(trade_id, room)


# ── Annonces des autres processus (bus.py) ───────────────────────────────────


def _message_json(db: Session, trade_id: uuid.UUID, message_id: uuid.UUID) -> dict | None:
    message = db.get(EchangeMessage, message_id)
    if message is None or message.echange_id != trade_id:
        return None
    return TradeMessageOut.of(message).model_dump(mode="json")


async def _on_notice(notice: bus.Notice) -> None:
    """Un autre processus a changé une salle : ses joueurs servis ici sont prévenus, d'après la base."""
    if rooms.get(notice.trade_id) is None:
        return  # personne n'est dans cette salle sur ce processus
    async with rooms.use(notice.trade_id) as room:
        if not room.seats:
            return
        if notice.event == bus.CHAT and notice.message_id is not None:
            message = await _db(_message_json, notice.trade_id, notice.message_id)
            if message is not None:
                await rooms.broadcast(room.seats, {"type": "chat", "message": message})
        elif notice.event in (bus.TRADE, bus.UNAVAILABLE):
            await _push_trade(notice.trade_id, room)
            if notice.event == bus.UNAVAILABLE:
                await rooms.broadcast(room.seats, {"type": "error", "problem": problem_body(_cards_unavailable())})


async def _resync() -> None:
    """Écoute rétablie : les annonces manquées sont perdues, chaque salle ouverte ici reçoit son
    état complet (`init`, que le client applique en remplaçant ce qu'il affiche)."""
    for trade_id in rooms.open_trades():
        async with rooms.use(trade_id) as room:
            if room.seats:
                trade_json, messages = await _db(_init_state, trade_id)
                init = {"type": "init", "trade": trade_json, "messages": messages, "online": room.online()}
                await rooms.broadcast(room.seats, init)


bus.listener.subscribe(_on_notice, _resync)


# ── Routes HTTP ──────────────────────────────────────────────────────────────


@router.post("", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
async def create_trade(data: TradeCreateIn, user: CurrentUser, db: DbSession, response: Response):
    """Ouvre une salle d'échange, tapis vides. S'il en existe déjà une avec ce joueur : 200, elle est renvoyée."""
    opened, created, changed = await run_in_threadpool(trade.create_trade, db, user, data)
    if not created:
        response.status_code = status.HTTP_200_OK
    if changed:
        await notify_room(opened.id)
    return TradeOut.of(opened)


@router.get("", response_model=Page[TradeOut])
def list_trades(
    user: CurrentUser,
    db: DbSession,
    page: Pagination,
    role: TradeRole = TradeRole.all,
    status: TradeStatus | None = None,
):
    """Historique de mes échanges, du plus récent au plus ancien (`role` : envoyés, reçus ou tous)."""
    statut = STATUT_OF[status] if status else None
    return Page[TradeOut].of(trade.list_trades(db, user, page, statut, role), TradeOut.of)


@router.get("/{tradeId}", response_model=TradeOut)
def get_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803 (nom du contrat)
    return TradeOut.of(trade.get_trade(db, user, tradeId))


@router.post("/{tradeId}/refuse", response_model=TradeOut)
async def refuse_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803
    """Le destinataire abandonne : la salle est fermée, aucun transfert."""
    closed = await run_in_threadpool(trade.refuse_trade, db, user, tradeId)
    await notify_room(closed.id)
    return TradeOut.of(closed)


@router.post("/{tradeId}/cancel", response_model=TradeOut)
async def cancel_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803
    """Le proposant abandonne : la salle est fermée, aucun transfert."""
    closed = await run_in_threadpool(trade.cancel_trade, db, user, tradeId)
    await notify_room(closed.id)
    return TradeOut.of(closed)


# ── Salle d'échange (WebSocket) ──────────────────────────────────────────────


def _enter(db: Session, token: str, trade_id: uuid.UUID) -> uuid.UUID:
    """Contrôle d'accès à l'ouverture : jeton valide, joueur de l'échange."""
    me = user_from_token(db, token, ACCESS)
    trade.get_trade(db, me, trade_id)
    return me.id


def _init_state(db: Session, trade_id: uuid.UUID) -> tuple[dict, list[dict]]:
    return (
        _trade_json(db, trade_id),
        [TradeMessageOut.of(m).model_dump(mode="json") for m in trade.messages(db, trade_id)],
    )


async def _deny(websocket: WebSocket, error: DomainError) -> None:
    """Refuse l'ouverture avec la réponse HTTP du contrat (401, 403, 404) quand le serveur le permet."""
    from app.main import problem_response  # import tardif : main importe les vues

    if "websocket.http.response" in websocket.scope.get("extensions", {}):
        await websocket.send_denial_response(problem_response(error))
    else:
        await websocket.close(code=1008, reason=error.code)


async def _handle(trade_id: uuid.UUID, seat: Seat, raw: str) -> None:
    """Applique l'action d'un joueur puis prévient la salle ; une action refusée ne revient qu'à son auteur."""
    try:
        command = client_message.validate_json(raw)
    except ValidationError as exc:
        await rooms.send(seat, {"type": "error", "problem": problem_body(validation_problem(exc.errors()))})
        return

    player = seat.player_id
    async with rooms.use(trade_id) as room:
        try:
            if isinstance(command, TradeChatCommand):
                sent = await _db(_as_player, player, trade.say, trade_id, command.text)
                message = TradeMessageOut.of(sent).model_dump(mode="json")
                await rooms.broadcast(room.seats, {"type": "chat", "message": message})
                return
            unavailable = False
            if isinstance(command, TradeOfferCommand):
                await _db(_as_player, player, trade.set_offer, trade_id, command.items)
            else:
                _, unavailable = await _db(_as_player, player, trade.set_ready, trade_id, command.ready)
            await _push_trade(trade_id, room)
            if unavailable:
                await rooms.broadcast(room.seats, {"type": "error", "problem": problem_body(_cards_unavailable())})
        except DomainError as error:
            await rooms.send(seat, {"type": "error", "problem": problem_body(error)})
        except Exception:
            log.exception("Action refusée dans la salle d'échange %s", trade_id)
            error = DomainError("Une erreur inattendue est survenue.", "INTERNAL_ERROR")
            await rooms.send(seat, {"type": "error", "problem": problem_body(error)})


@router.websocket("/{tradeId}/live")
async def join_trade(websocket: WebSocket, tradeId: str, access_token: str | None = None):  # noqa: N803
    """Salle d'échange : `init` à l'entrée, puis `trade`, `chat`, `presence` et `error`.

    Le jeton d'accès passe dans `access_token` (un navigateur n'envoie pas d'en-tête sur un WebSocket).
    """
    try:
        try:
            trade_id = uuid.UUID(tradeId)
        except ValueError:
            raise NotFound("Cet échange n'existe pas.")
        if not access_token:
            raise Unauthorized("Connectez-vous pour continuer.")
        player_id = await _db(_enter, access_token, trade_id)
    except DomainError as error:
        await _deny(websocket, error)
        return

    await websocket.accept()
    seat = Seat(websocket, player_id)
    async with rooms.use(trade_id) as room:
        arriving = not room.is_present(player_id)
        room.seats.add(seat)
        trade_json, messages = await _db(_init_state, trade_id)
        await rooms.send(seat, {"type": "init", "trade": trade_json, "messages": messages, "online": room.online()})
        if arriving:
            presence = {"type": "presence", "playerId": str(player_id), "online": True}
            await rooms.broadcast(room.seats - {seat}, presence)

    try:
        while True:
            received = await websocket.receive()
            if received["type"] == "websocket.disconnect":
                break
            raw = received.get("text") or (received.get("bytes") or b"").decode("utf-8", "replace")
            await _handle(trade_id, seat, raw)
    except WebSocketDisconnect:
        pass
    finally:
        await rooms.leave(trade_id, seat)
