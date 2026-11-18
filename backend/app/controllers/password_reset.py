"""AS-75 : lien de réinitialisation du mot de passe d'un joueur, généré par un admin.

- Le lien contient un jeton aléatoire de 32 octets ; la base n'en garde que l'empreinte SHA-256.
- Il vaut 5 minutes et ne sert qu'une fois. En générer un nouveau annule le précédent.
- Le joueur choisit un nouveau mot de passe : ses sessions ouvertes sont fermées (jetons_depuis,
  comme au changement de mot de passe).
- Lien inconnu, expiré, déjà utilisé ou remplacé : la même erreur, qui ne dit pas lequel.
"""

import hashlib
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import DomainError, NotFound
from app.models import ReinitialisationMdp, Role, Utilisateur, utcnow
from app.schemas.password_reset import PasswordResetLinkOut
from app.security import hash_password

LINK_LIFETIME = timedelta(minutes=5)
INVALID_LINK = "Ce lien n'est plus valable. Demandez-en un nouveau à un administrateur."


def _fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_link(db: Session, admin: Utilisateur, player_id: uuid.UUID) -> PasswordResetLinkOut:
    """Nouveau lien pour un joueur ; le lien précédent, s'il n'a pas servi, est annulé."""
    # Verrou sur le joueur : deux admins qui génèrent un lien en même temps passent l'un après l'autre.
    player = db.get(Utilisateur, player_id, with_for_update=True)
    if player is None or player.role != Role.JOUEUR or player.supprime_le is not None:
        raise NotFound("Ce joueur n'existe pas.")

    db.execute(
        update(ReinitialisationMdp)
        .where(
            ReinitialisationMdp.utilisateur_id == player.id,
            ReinitialisationMdp.utilise_le.is_(None),
            ReinitialisationMdp.annule_le.is_(None),
        )
        .values(annule_le=func.now())
    )
    token = secrets.token_urlsafe(32)
    created = utcnow()
    link = ReinitialisationMdp(
        utilisateur_id=player.id,
        jeton_hash=_fingerprint(token),
        cree_par=admin.id,
        cree_le=created,
        expire_le=created + LINK_LIFETIME,
    )
    db.add(link)
    db.commit()
    url = f"{get_settings().player_app_url.rstrip('/')}/reinitialiser?jeton={token}"
    return PasswordResetLinkOut(url=url, expires_at=link.expire_le)


def reset_password(db: Session, token: str, new_password: str) -> None:
    """Le joueur choisit un nouveau mot de passe avec le jeton du lien."""
    invalid = DomainError(INVALID_LINK, "RESET_LINK_INVALID")
    link = db.scalar(
        select(ReinitialisationMdp).where(ReinitialisationMdp.jeton_hash == _fingerprint(token)).with_for_update()
    )
    if link is None or link.utilise_le is not None or link.annule_le is not None or link.expire_le <= utcnow():
        raise invalid
    player = db.get(Utilisateur, link.utilisateur_id)
    if player is None or player.role != Role.JOUEUR or player.supprime_le is not None:
        raise invalid

    player.mot_de_passe_hash = hash_password(new_password)
    # Sessions ouvertes avant cette seconde : fermées (dependencies.user_from_token).
    player.jetons_depuis = func.date_trunc("second", func.now())
    link.utilise_le = func.now()
    db.commit()
