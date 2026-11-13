"""UC-09 à UC-11 : salle d'échange, abandon et historique.

Un échange est une salle partagée par deux joueurs (contrat, « Salle d'échange ») :
- chacun pose sur son tapis les cartes qu'il donne (OFFERT = tapis du proposeur,
  DEMANDE = tapis du destinataire), discute, puis valide ;
- un joueur ne modifie que son tapis, et seulement tant qu'il n'a pas validé ;
- toute modification d'un tapis retire les deux validations : on ne valide que ce que l'on voit ;
- on ne valide que s'il y a au moins une carte sur chaque tapis ;
- quand le second joueur valide, les cartes changent de collection dans une seule transaction.
  Si une carte n'est plus possédée, elle est retirée du tapis, les validations tombent et
  l'échange reste ouvert (`CARDS_UNAVAILABLE`) ;
- deux échanges conclus en même temps ne consomment jamais le même exemplaire
  (décrément conditionnel `quantite >= :q` évalué par Postgres) ;
- les échanges ne touchent pas au stock des créatures.

Chaque action sur la salle verrouille la ligne de l'échange (SELECT … FOR UPDATE) : les
actions des deux joueurs s'appliquent l'une après l'autre. Chaque changement est annoncé aux
autres processus de l'API dans la même transaction (`bus.announce`, envoyé au COMMIT).
"""

import enum
import uuid

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import bus
from app.controllers import collection
from app.controllers.catalog import paginate, parse_creature_id
from app.controllers.player import get_player
from app.errors import BadRequest, Conflict, DomainError, Forbidden, NotFound, from_integrity_error
from app.models import Creature, Echange, EchangeLigne, EchangeMessage, Sens, Statut, Utilisateur
from app.schemas.base import PageParams, PageResult
from app.schemas.trade import MAX_STACKS, TradeCreateIn, TradeItemIn, TradeRole

CARDS_UNAVAILABLE = "CARDS_UNAVAILABLE"
# La salle n'envoie que les derniers messages de la discussion.
MAX_MESSAGES = 200


class Side(enum.Enum):
    PROPOSER = Sens.OFFERT
    RECIPIENT = Sens.DEMANDE


class _CardMissing(Exception):
    pass


# ── Lecture ──────────────────────────────────────────────────────────────────


def _reload(db: Session, trade_id: uuid.UUID) -> Echange:
    return db.scalars(
        select(Echange).where(Echange.id == trade_id).execution_options(populate_existing=True)
    ).one()


def load(db: Session, trade_id: uuid.UUID) -> Echange:
    """Échange à jour, sans contrôle d'accès (diffusion dans la salle)."""
    return _reload(db, trade_id)


def _check_participant(trade: Echange | None, me: Utilisateur) -> Echange:
    if trade is None:
        raise NotFound("Cet échange n'existe pas.")
    if me.id not in (trade.proposeur_id, trade.destinataire_id):
        raise Forbidden("Cet échange ne vous concerne pas.")
    return trade


def get_trade(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    return _check_participant(db.get(Echange, trade_id), me)


def _locked(db: Session, me: Utilisateur, trade_id: uuid.UUID) -> Echange:
    """Échange verrouillé jusqu'à la fin de la transaction : une action à la fois par salle."""
    trade = db.scalars(
        select(Echange)
        .where(Echange.id == trade_id)
        .with_for_update(of=Echange)
        .execution_options(populate_existing=True)
    ).one_or_none()
    return _check_participant(trade, me)


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


def messages(db: Session, trade_id: uuid.UUID) -> list[EchangeMessage]:
    """Discussion de l'échange, du plus ancien au plus récent (les derniers messages seulement)."""
    latest = db.scalars(
        select(EchangeMessage)
        .where(EchangeMessage.echange_id == trade_id)
        .order_by(EchangeMessage.envoye_le.desc(), EchangeMessage.id.desc())
        .limit(MAX_MESSAGES)
    ).all()
    return list(reversed(latest))


# ── Ouverture ────────────────────────────────────────────────────────────────


def _pending_between(db: Session, a: uuid.UUID, b: uuid.UUID) -> Echange | None:
    return db.scalars(
        select(Echange)
        .where(
            Echange.statut == Statut.EN_ATTENTE,
            or_(
                (Echange.proposeur_id == a) & (Echange.destinataire_id == b),
                (Echange.proposeur_id == b) & (Echange.destinataire_id == a),
            ),
        )
        .order_by(Echange.cree_le)
        .limit(1)
    ).first()


def create_trade(db: Session, me: Utilisateur, data: TradeCreateIn) -> tuple[Echange, bool, bool]:
    """Ouvre une salle, tapis vides ; renvoie (échange, créé ?, salle existante modifiée ?).

    Un seul échange en cours entre deux joueurs : s'il existe, il est renvoyé tel quel.
    """
    if data.recipient_id == me.id:
        raise DomainError("Vous ne pouvez pas échanger avec vous-même.", "TRADE_WITH_SELF")
    recipient = get_player(db, data.recipient_id)

    wanted_id = None
    if data.wanted_creature_id is not None:
        wanted_id = parse_creature_id(data.wanted_creature_id)
        if db.get(Creature, wanted_id) is None:
            raise NotFound("Cette créature n'existe pas.")

    # Deux ouvertures simultanées entre les mêmes joueurs passent l'une après l'autre.
    first, second = sorted((str(me.id), str(recipient.id)))
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"echange:{first}:{second}"})

    existing = _pending_between(db, me.id, recipient.id)
    if existing is not None:
        changed = wanted_id is not None and existing.proposeur_id == me.id and existing.creature_cherchee_id != wanted_id
        if changed:
            existing.creature_cherchee_id = wanted_id
            bus.announce(db, existing.id, bus.TRADE)
        db.commit()
        return _reload(db, existing.id), False, changed

    trade = Echange(
        proposeur_id=me.id,
        destinataire_id=recipient.id,
        statut=Statut.EN_ATTENTE,
        creature_cherchee_id=wanted_id,
        proposeur_pret=False,
        destinataire_pret=False,
    )
    db.add(trade)
    db.commit()
    return _reload(db, trade.id), True, False


# ── Règles de la salle ───────────────────────────────────────────────────────


def _side(trade: Echange, me: Utilisateur) -> Side:
    return Side.PROPOSER if trade.proposeur_id == me.id else Side.RECIPIENT


def _owner(trade: Echange, sens: Sens) -> uuid.UUID:
    return trade.proposeur_id if sens == Sens.OFFERT else trade.destinataire_id


def _is_ready(trade: Echange, side: Side) -> bool:
    return trade.proposeur_pret if side == Side.PROPOSER else trade.destinataire_pret


def _set_ready(trade: Echange, side: Side, ready: bool) -> None:
    if side == Side.PROPOSER:
        trade.proposeur_pret = ready
    else:
        trade.destinataire_pret = ready


def _clear_validations(trade: Echange) -> None:
    trade.proposeur_pret = False
    trade.destinataire_pret = False


def _not_pending() -> Conflict:
    return Conflict("Cet échange est terminé.", "TRADE_NOT_PENDING")


def _require_pending(trade: Echange) -> None:
    if trade.statut != Statut.EN_ATTENTE:
        raise _not_pending()


def set_offer(db: Session, me: Utilisateur, trade_id: uuid.UUID, items: list[TradeItemIn]) -> Echange:
    """Remplace le tapis du joueur. Les deux validations tombent : l'échange n'est plus le même."""
    trade = _locked(db, me, trade_id)
    side = _side(trade, me)
    _require_pending(trade)
    if _is_ready(trade, side):
        raise BadRequest("Retirez votre validation pour modifier vos cartes.")

    # Une seule ligne par créature : les quantités d'une même carte s'additionnent.
    quantities: dict[int, int] = {}
    for item in items:
        creature_id = parse_creature_id(item.creature_id)
        quantities[creature_id] = quantities.get(creature_id, 0) + item.quantity
    if len(quantities) > MAX_STACKS:
        raise BadRequest(f"Pas plus de {MAX_STACKS} cartes différentes par tapis.")

    names = dict(db.execute(select(Creature.id, Creature.nom).where(Creature.id.in_(quantities))).all())
    if quantities.keys() - names.keys():
        raise NotFound("Cette créature n'existe pas.")
    for creature_id, quantity in quantities.items():
        if collection.owned_quantity(db, me.id, creature_id) < quantity:
            raise DomainError(f"Vous n'avez pas assez d'exemplaires de {names[creature_id]}.", "CARDS_NOT_OWNED")

    sens = side.value
    mine = {line.creature_id: line for line in trade.lignes if line.sens == sens}
    for creature_id, line in mine.items():
        if creature_id not in quantities:
            trade.lignes.remove(line)
    for creature_id, quantity in quantities.items():
        if creature_id in mine:
            mine[creature_id].quantite = quantity
        else:
            trade.lignes.append(EchangeLigne(creature_id=creature_id, sens=sens, quantite=quantity))
    _clear_validations(trade)
    bus.announce(db, trade.id, bus.TRADE)
    db.commit()
    return _reload(db, trade.id)


def _trim_mats(db: Session, trade: Echange) -> bool:
    """Retire des tapis ce que leurs joueurs ne possèdent plus. Vrai si un tapis a changé."""
    changed = False
    for line in list(trade.lignes):
        owned = collection.owned_quantity(db, _owner(trade, line.sens), line.creature_id)
        if owned >= line.quantite:
            continue
        changed = True
        if owned == 0:
            trade.lignes.remove(line)
        else:
            line.quantite = owned
    return changed


def _transfer(db: Session, trade: Echange) -> None:
    """Les deux tapis changent de main, tout ou rien (à appeler dans la transaction en cours)."""
    moves = []
    for line in trade.lignes:
        giver = _owner(trade, line.sens)
        receiver = trade.destinataire_id if giver == trade.proposeur_id else trade.proposeur_id
        moves += [(giver, line.creature_id, -line.quantite), (receiver, line.creature_id, line.quantite)]
    # Ordre fixe (joueur, créature) contre les interblocages ; les retraits d'abord : on ne donne
    # jamais une carte que l'on est en train de recevoir.
    for user_id, creature_id, delta in sorted(moves, key=lambda m: (m[0], m[1], m[2])):
        if delta < 0:
            if not collection.remove_cards(db, user_id, creature_id, -delta):
                raise _CardMissing
        else:
            collection.add_cards(db, user_id, creature_id, delta)


def set_ready(db: Session, me: Utilisateur, trade_id: uuid.UUID, ready: bool) -> tuple[Echange, bool]:
    """Valide l'échange tel qu'il est, ou retire sa validation ; renvoie (échange, carte manquante ?).

    Quand les deux joueurs ont validé, les cartes sont transférées. Si une carte posée n'est plus
    possédée, elle est retirée du tapis, personne n'a validé et l'échange reste ouvert.
    """
    trade = _locked(db, me, trade_id)
    side = _side(trade, me)
    _require_pending(trade)
    if not ready:
        _set_ready(trade, side, False)
        bus.announce(db, trade.id, bus.TRADE)
        db.commit()
        return _reload(db, trade.id), False

    if not any(l.sens == Sens.OFFERT for l in trade.lignes) or not any(l.sens == Sens.DEMANDE for l in trade.lignes):
        raise BadRequest("Il faut au moins une carte sur chaque tapis.")
    # Les deux tapis sont revérifiés à chaque validation.
    if _trim_mats(db, trade):
        _clear_validations(trade)
        bus.announce(db, trade.id, bus.UNAVAILABLE)
        db.commit()
        return _reload(db, trade.id), True

    _set_ready(trade, side, True)
    if trade.proposeur_pret and trade.destinataire_pret:
        try:
            _transfer(db, trade)
            trade.statut = Statut.ACCEPTE
            trade.decide_le = func.now()
            bus.announce(db, trade.id, bus.TRADE)
            db.commit()
        except _CardMissing:
            # Une carte a disparu entre la vérification et le transfert : rien n'est transféré.
            db.rollback()
            trade = _locked(db, me, trade_id)
            _trim_mats(db, trade)
            _clear_validations(trade)
            bus.announce(db, trade.id, bus.UNAVAILABLE)
            db.commit()
            return _reload(db, trade.id), True
        except IntegrityError as exc:
            db.rollback()
            raise from_integrity_error(exc)
    else:
        bus.announce(db, trade.id, bus.TRADE)
        db.commit()
    return _reload(db, trade.id), False


def say(db: Session, me: Utilisateur, trade_id: uuid.UUID, text_: str) -> EchangeMessage:
    trade = get_trade(db, me, trade_id)
    if trade.statut != Statut.EN_ATTENTE:
        raise Conflict("L'échange est terminé : la discussion est fermée.", "TRADE_NOT_PENDING")
    # Identifiant fixé ici (et non au flush) : il part dans l'annonce aux autres processus.
    message = EchangeMessage(id=uuid.uuid4(), echange_id=trade.id, auteur_id=me.id, texte=text_)
    db.add(message)
    bus.announce(db, trade.id, bus.CHAT, message.id)
    db.commit()
    return db.scalars(
        select(EchangeMessage).where(EchangeMessage.id == message.id).execution_options(populate_existing=True)
    ).one()


# ── Abandon ──────────────────────────────────────────────────────────────────


def _close_pending(db: Session, trade: Echange, new_status: Statut) -> bool:
    """Passe l'échange de EN_ATTENTE à `new_status`. Faux si quelqu'un l'a déjà traité."""
    result = db.execute(
        update(Echange)
        .where(Echange.id == trade.id, Echange.statut == Statut.EN_ATTENTE)
        .values(statut=new_status, decide_le=func.now())
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def _finish(db: Session, trade: Echange, new_status: Statut) -> Echange:
    if trade.statut != Statut.EN_ATTENTE or not _close_pending(db, trade, new_status):
        db.rollback()
        raise _not_pending()
    bus.announce(db, trade.id, bus.TRADE)
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
