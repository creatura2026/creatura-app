"""UC-09 à UC-11 : proposer, décider et consulter les échanges (n cartes ↔ n cartes).

Règles de transfert :
- seules les cartes possédées en quantité suffisante peuvent être proposées ou demandées ;
- la disponibilité est revérifiée au moment de l'acceptation ;
- les deux collections changent ensemble ou pas du tout (une seule transaction) ;
- deux acceptations concurrentes ne consomment jamais le même exemplaire
  (décrément conditionnel `quantite >= :q` évalué par Postgres) ;
- les échanges ne touchent pas au stock des créatures.
"""

import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.controllers import collection
from app.controllers.player import get_player
from app.errors import BadRequest, Conflict, Forbidden, NotFound, from_integrity_error
from app.models import Creature, Echange, EchangeLigne, Sens, Statut, Utilisateur
from app.schemas.trade import TradeCreateIn, TradeLineIn, TradeRole


def _check_lines(data: TradeCreateIn) -> None:
    offered = [l.creature_id for l in data.offered]
    requested = [l.creature_id for l in data.requested]
    if len(set(offered)) != len(offered) or len(set(requested)) != len(requested):
        raise BadRequest("Une même créature apparaît deux fois du même côté de l'échange")
    if set(offered) & set(requested):
        raise BadRequest("Une créature ne peut pas être à la fois offerte et demandée")


def _check_owned(db: Session, owner_id: uuid.UUID, lines: list[TradeLineIn], names: dict, who: str) -> None:
    for line in lines:
        if collection.owned_quantity(db, owner_id, line.creature_id) < line.quantity:
            raise Conflict(f"{who} pas assez d'exemplaires de {names[line.creature_id]}")


def create_trade(db: Session, me: Utilisateur, data: TradeCreateIn) -> Echange:
    if data.recipient_id == me.id:
        raise BadRequest("Impossible de proposer un échange à soi-même")
    _check_lines(data)
    recipient = get_player(db, data.recipient_id)

    ids = {l.creature_id for l in data.offered + data.requested}
    names = dict(db.execute(select(Creature.id, Creature.nom).where(Creature.id.in_(ids))).all())
    if missing := ids - names.keys():
        raise NotFound(f"Créature introuvable : {sorted(missing)}")

    _check_owned(db, me.id, data.offered, names, "Vous n'avez")
    _check_owned(db, recipient.id, data.requested, names, "Ce joueur n'a")

    trade = Echange(
        proposeur_id=me.id,
        destinataire_id=recipient.id,
        statut=Statut.EN_ATTENTE,
        lignes=[
            *(EchangeLigne(creature_id=l.creature_id, sens=Sens.OFFERT, quantite=l.quantity) for l in data.offered),
            *(EchangeLigne(creature_id=l.creature_id, sens=Sens.DEMANDE, quantite=l.quantity) for l in data.requested),
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
    if trade is None or me.id not in (trade.proposeur_id, trade.destinataire_id):
        raise NotFound("Échange introuvable")
    return trade


def list_trades(
    db: Session, me: Utilisateur, status: Statut | None = None, role: TradeRole = TradeRole.all
) -> list[Echange]:
    if role == TradeRole.sent:
        query = select(Echange).where(Echange.proposeur_id == me.id)
    elif role == TradeRole.received:
        query = select(Echange).where(Echange.destinataire_id == me.id)
    else:
        query = select(Echange).where(or_(Echange.proposeur_id == me.id, Echange.destinataire_id == me.id))
    if status is not None:
        query = query.where(Echange.statut == status)
    return list(db.scalars(query.order_by(Echange.cree_le.desc(), Echange.id)))


def _close_pending(db: Session, trade: Echange, new_status: Statut) -> bool:
    """Passe l'échange de EN_ATTENTE à `new_status`. Faux si quelqu'un l'a déjà traité."""
    result = db.execute(
        update(Echange)
        .where(Echange.id == trade.id, Echange.statut == Statut.EN_ATTENTE)
        .values(statut=new_status, decide_le=func.now())
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def _check_pending(trade: Echange) -> None:
    if trade.statut != Statut.EN_ATTENTE:
        raise Conflict("Cet échange n'est plus en attente")


def _finish(db: Session, trade: Echange, new_status: Statut) -> Echange:
    if not _close_pending(db, trade, new_status):
        db.rollback()
        raise Conflict("Cet échange n'est plus en attente")
    db.commit()
    return _reload(db, trade.id)


def cancel_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.proposeur_id != me.id:
        raise Forbidden("Seul l'auteur de la proposition peut l'annuler")
    _check_pending(trade)
    return _finish(db, trade, Statut.ANNULE)


def refuse_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut refuser l'échange")
    _check_pending(trade)
    return _finish(db, trade, Statut.REFUSE)


def accept_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    trade = get_trade(db, me, trade_id)
    if trade.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut accepter l'échange")
    _check_pending(trade)

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
            raise Conflict("Cet échange n'est plus en attente")
        # Ordre fixe (joueur, créature) pour éviter les interblocages entre échanges croisés.
        for user_id, creature_id, delta in sorted(moves, key=lambda m: (m[0], m[1])):
            if delta < 0:
                if not collection.remove_cards(db, user_id, creature_id, -delta):
                    raise Conflict("Une des cartes n'est plus disponible : aucun transfert effectué")
            else:
                collection.add_cards(db, user_id, creature_id, delta)
        db.commit()
    except Conflict:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise from_integrity_error(exc)

    return _reload(db, trade.id)
