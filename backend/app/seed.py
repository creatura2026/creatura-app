"""Création du compte administrateur.

Le schéma et le catalogue viennent des fichiers SQL de db/. Seul le compte admin est créé
par le back, car le hash bcrypt du mot de passe est calculé ici.
Idempotent et sans risque si plusieurs instances démarrent en même temps.
Lancement manuel / Job K8S : `python -m app.seed`
"""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.database import SessionLocal
from app.models import Role, Utilisateur
from app.security import hash_password


def ensure_admin() -> None:
    settings = get_settings()
    if not settings.admin_login or not settings.admin_password:
        return
    with SessionLocal() as db:
        exists = db.scalar(
            select(Utilisateur.id).where(
                (Utilisateur.identifiant == settings.admin_login)
                | (func.lower(Utilisateur.pseudo) == settings.admin_pseudo.lower())
            )
        )
        if exists is not None:
            return
        db.add(
            Utilisateur(
                pseudo=settings.admin_pseudo,
                identifiant=settings.admin_login,
                mot_de_passe_hash=hash_password(settings.admin_password),
                role=Role.ADMIN,
            )
        )
        try:
            db.commit()
        except IntegrityError:  # créé au même moment par une autre instance
            db.rollback()


if __name__ == "__main__":
    ensure_admin()
    print("Compte administrateur en place.")
