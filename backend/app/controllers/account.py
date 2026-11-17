"""Gestion du compte : changement du mot de passe, suppression du compte.

Suppression : la ligne `utilisateur` n'est pas effacée, car les échanges et la discussion des
autres joueurs la référencent. Elle est anonymisée dans une seule transaction :
- pseudo « Joueur supprimé #<fin de l'identifiant> » en base, unique (impossible à choisir à
  l'inscription : espace et accent) ; l'API affiche simplement « Joueur supprimé »,
  identifiant libéré, mot de passe inutilisable, `supprime_le` renseigné ;
- collection effacée, les légendaires retournant au stock (stock_total = restant + collections) ;
- échanges en cours abandonnés (annulés s'il les proposait, refusés sinon), salles prévenues ;
- jetons révoqués. L'historique des boosters reste, anonyme, pour les statistiques.

Un administrateur ne peut supprimer son compte que s'il reste un autre administrateur.
"""

import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app import bus
from app.controllers.auth import _tokens
from app.errors import Conflict, field_error
from app.models import Collection, Creature, Echange, Role, Statut, Utilisateur
from app.schemas.auth import AuthTokensOut
from app.security import hash_password, verify_password

DELETED_PSEUDO = "Joueur supprimé #"
UNUSABLE_HASH = "!"  # jamais produit par bcrypt : aucune connexion possible


def _check_password(user: Utilisateur, password: str, field: str) -> None:
    if not verify_password(password, user.mot_de_passe_hash):
        raise field_error("VALIDATION_ERROR", field, "Mot de passe incorrect.")


def change_password(db: Session, me: Utilisateur, current: str, new: str) -> AuthTokensOut:
    """Nouveau mot de passe ; les autres sessions sont fermées, celle-ci reçoit de nouveaux jetons."""
    _check_password(me, current, "currentPassword")
    if verify_password(new, me.mot_de_passe_hash):
        raise field_error("VALIDATION_ERROR", "newPassword", "Le nouveau mot de passe doit être différent de l'actuel.")
    me.mot_de_passe_hash = hash_password(new)
    # Jetons émis avant cette seconde : refusés (dependencies.user_from_token). Les nouveaux
    # jetons de cette session ont un `iat` égal ou postérieur : ils restent valides.
    me.jetons_depuis = func.date_trunc("second", func.now())
    db.commit()
    db.refresh(me)
    return _tokens(me)


def delete_account(db: Session, me: Utilisateur, password: str) -> list[uuid.UUID]:
    """Supprime (anonymise) le compte ; renvoie les échanges abandonnés, pour prévenir leurs salles."""
    _check_password(me, password, "password")

    if me.role == Role.ADMIN:
        # Verrou sur les comptes admin : deux admins qui se suppriment en même temps ne peuvent
        # pas laisser le jeu sans administrateur.
        admins = db.scalars(
            select(Utilisateur.id)
            .where(Utilisateur.role == Role.ADMIN, Utilisateur.supprime_le.is_(None))
            .with_for_update()
        ).all()
        if len([a for a in admins if a != me.id]) == 0:
            raise Conflict(
                "Vous êtes le dernier administrateur : nommez-en un autre avant de supprimer votre compte.",
                "LAST_ADMIN",
            )

    # Échanges en cours : abandonnés, comme s'il avait quitté chaque salle.
    pending = db.scalars(
        select(Echange)
        .where(
            Echange.statut == Statut.EN_ATTENTE,
            or_(Echange.proposeur_id == me.id, Echange.destinataire_id == me.id),
        )
        .with_for_update(of=Echange)
    ).all()
    for trade in pending:
        trade.statut = Statut.ANNULE if trade.proposeur_id == me.id else Statut.REFUSE
        trade.decide_le = func.now()
        bus.announce(db, trade.id, bus.TRADE)

    # Collection : les légendaires (stock limité) retournent au stock, puis tout est effacé.
    owned = db.execute(
        select(Collection.creature_id, Collection.quantite).where(
            Collection.utilisateur_id == me.id, Collection.quantite > 0
        )
    ).all()
    for creature_id, quantity in owned:
        db.execute(
            update(Creature)
            .where(Creature.id == creature_id, Creature.stock_total.is_not(None))
            .values(stock_restant=Creature.stock_restant + quantity)
        )
    db.execute(Collection.__table__.delete().where(Collection.utilisateur_id == me.id))

    # Fin de l'identifiant (12 caractères) : le début peut être commun (comptes de démo 00000000-…).
    me.pseudo = f"{DELETED_PSEUDO}{me.id.hex[-12:]}"
    me.identifiant = f"supprime:{me.id}"
    me.mot_de_passe_hash = UNUSABLE_HASH
    me.supprime_le = func.now()
    me.jetons_depuis = func.now()
    db.commit()
    return [trade.id for trade in pending]
