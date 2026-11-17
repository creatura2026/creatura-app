"""Don de carte entre joueurs (contrat « Gift »).

Un joueur offre une ou plusieurs copies d'une carte qu'il possède à un autre joueur. Le don
reste EN_ATTENTE jusqu'à la décision du destinataire :
- il accepte : les copies passent de la collection du donneur à la sienne, tout ou rien ;
- il refuse : rien ne bouge.
Le donneur peut annuler tant que le don est en attente.

Les cartes ne sont pas réservées (comme l'échange) : la possession est revérifiée au moment de
l'acceptation par un décrément conditionnel côté Postgres. Si une copie a disparu entre-temps
(autre don, échange, booster déjà ouvert… non, mais un autre don accepté), le don passe ECHOUE et
rien n'est transféré. Le don ne touche jamais au stock des créatures.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.controllers import collection
from app.controllers.catalog import paginate, parse_creature_id
from app.controllers.player import get_player
from app.errors import Conflict, DomainError, Forbidden, NotFound, field_error, from_integrity_error
from app.models import Creature, Don, Statut, Utilisateur
from app.schemas.base import PageParams, PageResult
from app.schemas.gift import GiftCreateIn, GiftRole

CARDS_UNAVAILABLE = "CARDS_UNAVAILABLE"


# ── Lecture ──────────────────────────────────────────────────────────────────


def _reload(db: Session, gift_id: uuid.UUID) -> Don:
    return db.scalars(
        select(Don).where(Don.id == gift_id).execution_options(populate_existing=True)
    ).one()


def list_gifts(
    db: Session,
    me: Utilisateur,
    params: PageParams,
    status: Statut | None = None,
    role: GiftRole = GiftRole.all,
) -> PageResult:
    """Dons du joueur (reçus et/ou envoyés), du plus récent au plus ancien."""
    if role == GiftRole.sent:
        query = select(Don).where(Don.donneur_id == me.id)
    elif role == GiftRole.received:
        query = select(Don).where(Don.destinataire_id == me.id)
    else:
        query = select(Don).where(or_(Don.donneur_id == me.id, Don.destinataire_id == me.id))
    if status is not None:
        query = query.where(Don.statut == status)
    return paginate(db, query.order_by(Don.cree_le.desc(), Don.id), params)


# ── Ouverture ────────────────────────────────────────────────────────────────


def _pending(db: Session, giver_id: uuid.UUID, recipient_id: uuid.UUID, creature_id: int) -> Don | None:
    return db.scalars(
        select(Don).where(
            Don.statut == Statut.EN_ATTENTE,
            Don.donneur_id == giver_id,
            Don.destinataire_id == recipient_id,
            Don.creature_id == creature_id,
        )
    ).first()


def create_gift(db: Session, me: Utilisateur, data: GiftCreateIn) -> Don:
    """Crée un don en attente ; vérifie que le donneur possède assez d'exemplaires."""
    if data.recipient_id == me.id:
        raise DomainError("Vous ne pouvez pas vous offrir une carte à vous-même.", "GIFT_WITH_SELF")
    recipient = get_player(db, data.recipient_id)

    creature_id = parse_creature_id(data.creature_id)
    if db.get(Creature, creature_id) is None:
        raise NotFound("Cette créature n'existe pas.")

    if collection.owned_quantity(db, me.id, creature_id) < data.quantity:
        raise field_error(
            "VALIDATION_ERROR", "quantity", "Vous ne possédez pas assez d'exemplaires de cette carte."
        )
    if _pending(db, me.id, recipient.id, creature_id) is not None:
        raise Conflict("Un don de cette carte à ce joueur est déjà en attente.", "GIFT_ALREADY_PENDING")

    gift = Don(
        donneur_id=me.id,
        destinataire_id=recipient.id,
        creature_id=creature_id,
        quantite=data.quantity,
        statut=Statut.EN_ATTENTE,
    )
    db.add(gift)
    try:
        db.commit()  # uq_don_en_attente : course entre deux créations simultanées
    except IntegrityError as exc:
        db.rollback()
        raise from_integrity_error(exc)
    return _reload(db, gift.id)


# ── Décision ─────────────────────────────────────────────────────────────────


def _locked(db: Session, gift_id: uuid.UUID) -> Don:
    """Don verrouillé jusqu'à la fin de la transaction : une décision à la fois."""
    gift = db.scalars(
        select(Don).where(Don.id == gift_id).with_for_update(of=Don).execution_options(populate_existing=True)
    ).one_or_none()
    if gift is None:
        raise NotFound("Ce don n'existe pas.")
    return gift


def _require_pending(gift: Don) -> None:
    if gift.statut != Statut.EN_ATTENTE:
        raise Conflict("Ce don a déjà été traité.", "GIFT_NOT_PENDING")


def accept_gift(db: Session, me: Utilisateur, gift_id: uuid.UUID) -> Don:
    """Le destinataire accepte : les cartes passent dans sa collection, tout ou rien.

    Si le donneur ne possède plus assez d'exemplaires, le don passe ECHOUE et rien n'est transféré.
    """
    gift = _locked(db, gift_id)
    if gift.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut accepter ce don.")
    _require_pending(gift)
    try:
        if collection.remove_cards(db, gift.donneur_id, gift.creature_id, gift.quantite):
            collection.add_cards(db, gift.destinataire_id, gift.creature_id, gift.quantite)
            gift.statut = Statut.ACCEPTE
        else:
            gift.statut = Statut.ECHOUE
            gift.motif_echec = CARDS_UNAVAILABLE
        gift.decide_le = func.now()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise from_integrity_error(exc)
    return _reload(db, gift_id)


def refuse_gift(db: Session, me: Utilisateur, gift_id: uuid.UUID) -> Don:
    gift = _locked(db, gift_id)
    if gift.destinataire_id != me.id:
        raise Forbidden("Seul le destinataire peut refuser ce don.")
    _require_pending(gift)
    gift.statut = Statut.REFUSE
    gift.decide_le = func.now()
    db.commit()
    return _reload(db, gift_id)


def cancel_gift(db: Session, me: Utilisateur, gift_id: uuid.UUID) -> Don:
    gift = _locked(db, gift_id)
    if gift.donneur_id != me.id:
        raise Forbidden("Seul le donneur peut annuler ce don.")
    _require_pending(gift)
    gift.statut = Statut.ANNULE
    gift.decide_le = func.now()
    db.commit()
    return _reload(db, gift_id)
