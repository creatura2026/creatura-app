"""UC-09 à UC-11 : proposer, décider et consulter les échanges (n cartes ↔ n cartes).

Règles de transfert :
- seules les cartes possédées en quantité suffisante peuvent être proposées ou demandées ;
- les cartes ne sont pas réservées : leur disponibilité est revérifiée à l'acceptation ;
- les deux collections changent ensemble ou pas du tout (une seule transaction) ;
- si une carte manque à l'acceptation, rien n'est transféré et l'échange passe en ECHOUE ;
- deux acceptations concurrentes ne consomment jamais le même exemplaire
  (décrément conditionnel `quantite >= :q` évalué par Postgres) ;
- les échanges ne touchent pas au stock des créatures.
"""

import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.controllers import collection
from app.controllers.catalog import paginate, parse_creature_id
from app.controllers.player import get_player
from app.errors import BadRequest, Conflict, DomainError, Forbidden, NotFound, from_integrity_error
from app.models import Creature, Echange, EchangeLigne, Sens, Statut, Utilisateur
from app.schemas.base import PageParams, PageResult
from app.schemas.trade import TradeCreateIn, TradeItemIn, TradeRole

CARDS_UNAVAILABLE = "CARDS_UNAVAILABLE"


class _CardMissing(Exception):
    def __init__(self, user_id: uuid.UUID, creature_id: int):
        self.user_id, self.creature_id = user_id, creature_id


def _lines(items: list[TradeItemIn]) -> dict[int, int]:
    """{id de créature: quantité} ; une créature ne peut apparaître qu'une fois par côté."""
    lines: dict[int, int] = {}
    for item in items:
        creature_id = parse_creature_id(item.creature_id)
        if creature_id in lines:
            raise BadRequest("Une même créature apparaît deux fois du même côté de l'échange.")
        lines[creature_id] = item.quantity
    return lines


def _check_owned(db: Session, owner_id: uuid.UUID, lines: dict[int, int], names: dict, message: str) -> None:
    for creature_id, quantity in lines.items():
        if collection.owned_quantity(db, owner_id, creature_id) < quantity:
            raise DomainError(message.format(name=names[creature_id]), "CARDS_NOT_OWNED")


def create_trade(db: Session, me: Utilisateur, data: TradeCreateIn) -> Echange:
    if data.recipient_id == me.id:
        raise DomainError("Vous ne pouvez pas échanger avec vous-même.", "TRADE_WITH_SELF")
    recipient = get_player(db, data.recipient_id)

    offered, requested = _lines(data.offered), _lines(data.requested)
    if offered.keys() & requested.keys():
        raise BadRequest("Une créature ne peut pas être à la fois offerte et demandée.")

    ids = offered.keys() | requested.keys()
    names = dict(db.execute(select(Creature.id, Creature.nom).where(Creature.id.in_(ids))).all())
    if ids - names.keys():
        raise NotFound("Cette créature n'existe pas.")

    _check_owned(db, me.id, offered, names, "Vous ne possédez pas assez d'exemplaires de {name}.")
    _check_owned(db, recipient.id, requested, names, f"{recipient.pseudo} ne possède pas assez d'exemplaires de {{name}}.")

    trade = Echange(
        proposeur_id=me.id,
        destinataire_id=recipient.id,
        statut=Statut.EN_ATTENTE,
        lignes=[
            *(EchangeLigne(creature_id=c, sens=Sens.OFFERT, quantite=q) for c, q in offered.items()),
            *(EchangeLigne(creature_id=c, sens=Sens.DEMANDE, quantite=q) for c, q in requested.items()),
        ],
    )
    db.add(trade)
    db.commit()
    return _reload(db, trade.id)


def _reload(db: Session, trade_id: uuid.UUID) -> Echange:
    return db.scalars(
        select(Echange).where(Echange.id == trade_id).execution_options(populate_existing=True)
    ).one()


def get_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = db.get(Echange, trade_id)
    if trade is None:
        raise NotFound("Cet échange n'existe pas.")
    if me.id not in (trade.proposeur_id, trade.destinataire_id):
        raise Forbidden("Cet échange ne vous concerne pas.")
    return trade


def list_trades(
    db: Session,
    me: Utilisateur,
    params: PageParams,
    status: Statut | None = None,
    role: TradeRole = TradeRole.all,
) -> PageResult:
    """Échanges du joueur, du plus récent au plus ancien."""
    if role == TradeRole.sent:
        query = select(Echange).where(Echange.proposeur_id == me.id)
    elif role == TradeRole.received:
        query = select(Echange).where(Echange.destinataire_id == me.id)
    else:
        query = select(Echange).where(or_(Echange.proposeur_id == me.id, Echange.destinataire_id == me.id))
    if status is not None:
        query = query.where(Echange.statut == status)
    return paginate(db, query.order_by(Echange.cree_le.desc(), Echange.id), params)


def _close_pending(db: Session, trade: Echange, new_status: Statut, motif: str | None = None) -> bool:
    """Passe l'échange de EN_ATTENTE à `new_status`. Faux si quelqu'un l'a déjà traité."""
    result = db.execute(
        update(Echange)
        .where(Echange.id == trade.id, Echange.statut == Statut.EN_ATTENTE)
        .values(statut=new_status, decide_le=func.now(), motif_echec=motif)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def _not_pending() -> Conflict:
    return Conflict("Cet échange n'est plus en attente.", "TRADE_NOT_PENDING")


def _finish(db: Session, trade: Echange, new_status: Statut) -> Echange:
    if trade.statut != Statut.EN_ATTENTE or not _close_pending(db, trade, new_status):
        db.rollback()
        raise _not_pending()
    db.commit()
    return _reload(db, trade.id)


def cancel_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.proposeur_id != me.id:
        raise Forbidden("Seul le proposant peut annuler.")
    return _finish(db, trade, Statut.ANNULE)


def refuse_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut refuser.")
    return _finish(db, trade, Statut.REFUSE)


def _missing_message(trade: Echange, missing: _CardMissing) -> str:
    name = next(l.creature.nom for l in trade.lignes if l.creature_id == missing.creature_id)
    where = (
        f"chez {trade.proposeur.pseudo}" if missing.user_id == trade.proposeur_id else "dans votre collection"
    )
    return f"{name} n'est plus disponible {where}. Aucune carte n'a été transférée."


def accept_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut accepter.")
    if trade.statut != Statut.EN_ATTENTE:
        raise _not_pending()

    # (joueur, créature, variation) : chaque ligne retire au donneur et ajoute au receveur.
    moves = []
    for line in trade.lignes:
        giver, receiver = (
            (trade.proposeur_id, trade.destinataire_id)
            if line.sens == Sens.OFFERT
            else (trade.destinataire_id, trade.proposeur_id)
        )
        moves += [(giver, line.creature_id, -line.quantite), (receiver, line.creature_id, line.quantite)]

    try:
        if not _close_pending(db, trade, Statut.ACCEPTE):
            raise _not_pending()
        # Ordre fixe (joueur, créature) pour éviter les interblocages entre échanges croisés.
        for user_id, creature_id, delta in sorted(moves, key=lambda m: (m[0], m[1])):
            if delta < 0:
                if not collection.remove_cards(db, user_id, creature_id, -delta):
                    raise _CardMissing(user_id, creature_id)
            else:
                collection.add_cards(db, user_id, creature_id, delta)
        db.commit()
    except Conflict:
        db.rollback()
        raise
    except _CardMissing as missing:
        # Rien n'a été transféré (rollback) ; l'échange passe en ECHOUE s'il est encore en attente.
        db.rollback()
        if _close_pending(db, trade, Statut.ECHOUE, CARDS_UNAVAILABLE):
            db.commit()
        else:
            db.rollback()
        raise Conflict(_missing_message(trade, missing), CARDS_UNAVAILABLE)
    except IntegrityError as exc:
        db.rollback()
        raise from_integrity_error(exc)

    return _reload(db, trade.id)
