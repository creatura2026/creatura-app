"""Modèles ORM : correspondance exacte avec db/init/01_schema.sql et ses évolutions (04_…, 05_…).

Le schéma est la source de vérité : le back ne crée ni ne modifie aucune table
(pas de `create_all`). Les noms suivent la base : français, snake_case, sans accents.
Les valeurs autorisées sont des varchar + CHECK côté SQL, des Enum côté Python.
"""

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    JOUEUR = "JOUEUR"
    ADMIN = "ADMIN"


class Famille(str, enum.Enum):
    NATURE = "NATURE"
    CRISTAL = "CRISTAL"
    BRUME = "BRUME"
    LUEUR = "LUEUR"


class Rarete(str, enum.Enum):
    COMMUN = "COMMUN"
    PEU_COMMUN = "PEU_COMMUN"
    RARE = "RARE"


class Statut(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACCEPTE = "ACCEPTE"
    REFUSE = "REFUSE"
    ANNULE = "ANNULE"
    ECHOUE = "ECHOUE"  # acceptation impossible : une carte n'était plus disponible


class Sens(str, enum.Enum):
    OFFERT = "OFFERT"  # donnée par le proposeur
    DEMANDE = "DEMANDE"  # donnée par le destinataire


def _varchar_enum(enum_class: type[enum.Enum], length: int) -> Enum:
    """Enum stockée en varchar ; le CHECK est déjà dans le schéma SQL."""
    return Enum(enum_class, native_enum=False, create_constraint=False, length=length)


class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    pseudo: Mapped[str] = mapped_column(String(30))
    identifiant: Mapped[str] = mapped_column(String(50), unique=True)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(_varchar_enum(Role, 10), default=Role.JOUEUR)
    dernier_booster: Mapped[date | None] = mapped_column(Date)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Creature(Base):
    __tablename__ = "creature"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    famille: Mapped[Famille] = mapped_column(_varchar_enum(Famille, 20))
    rarete: Mapped[Rarete] = mapped_column(_varchar_enum(Rarete, 20))
    poids: Mapped[int] = mapped_column(Integer)
    image: Mapped[str] = mapped_column(String(255))
    stock_total: Mapped[int] = mapped_column(Integer)
    stock_restant: Mapped[int] = mapped_column(Integer)


class Collection(Base):
    """Nombre d'exemplaires d'une créature possédés par un joueur."""

    __tablename__ = "collection"

    utilisateur_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("utilisateur.id"), primary_key=True)
    creature_id: Mapped[int] = mapped_column(ForeignKey("creature.id"), primary_key=True)
    quantite: Mapped[int] = mapped_column(Integer)

    creature: Mapped[Creature] = relationship(lazy="joined")


class Echange(Base):
    __tablename__ = "echange"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    proposeur_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("utilisateur.id"))
    destinataire_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("utilisateur.id"))
    statut: Mapped[Statut] = mapped_column(_varchar_enum(Statut, 12), default=Statut.EN_ATTENTE)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decide_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motif_echec: Mapped[str | None] = mapped_column(String(30))
    # Salle d'échange (05_evolution_salle_echange.sql)
    proposeur_pret: Mapped[bool] = mapped_column(Boolean, default=False)
    destinataire_pret: Mapped[bool] = mapped_column(Boolean, default=False)
    creature_cherchee_id: Mapped[int | None] = mapped_column(ForeignKey("creature.id"))

    proposeur: Mapped[Utilisateur] = relationship(foreign_keys=[proposeur_id], lazy="joined")
    destinataire: Mapped[Utilisateur] = relationship(foreign_keys=[destinataire_id], lazy="joined")
    creature_cherchee: Mapped["Creature | None"] = relationship(lazy="joined")
    # Ordre de pose sur le tapis : pas de date dans echange_ligne, on garde l'ordre du catalogue.
    lignes: Mapped[list["EchangeLigne"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="EchangeLigne.creature_id"
    )


class EchangeMessage(Base):
    """Message de la discussion d'un échange."""

    __tablename__ = "echange_message"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    echange_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("echange.id"))
    auteur_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("utilisateur.id"))
    texte: Mapped[str] = mapped_column(String(500))
    envoye_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    auteur: Mapped[Utilisateur] = relationship(lazy="joined")


class EchangeLigne(Base):
    __tablename__ = "echange_ligne"

    echange_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("echange.id"), primary_key=True)
    creature_id: Mapped[int] = mapped_column(ForeignKey("creature.id"), primary_key=True)
    sens: Mapped[Sens] = mapped_column(_varchar_enum(Sens, 8), primary_key=True)
    quantite: Mapped[int] = mapped_column(Integer)

    creature: Mapped[Creature] = relationship(lazy="joined")


class Reglage(Base):
    """Réglages du jeu modifiables par un administrateur (une seule ligne, id = 1)."""

    __tablename__ = "reglage"

    ID = 1

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=ID)
    cartes_par_booster: Mapped[int] = mapped_column(Integer)
    modifie_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    modifie_par_id: Mapped[uuid.UUID | None] = mapped_column("modifie_par", ForeignKey("utilisateur.id"))

    modifie_par: Mapped[Utilisateur | None] = relationship(lazy="joined")
