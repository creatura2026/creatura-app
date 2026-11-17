"""Joueurs, demandes de suppression et comptes admin dans le dashboard (AS-71).

Les règles qui touchent plusieurs comptes (demande, validation, annulation, désactivation,
suppression d'un joueur) sont dans les fonctions SQL de db/init/10_evolution_joueurs_admin.sql.
Leurs refus portent un nom de contrainte, traduit en erreur d'API par app.errors.
"""

import uuid
from datetime import date

from sqlalchemy import Date, cast, func, nulls_last, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.controllers.admin import _days, _local_day
from app.controllers.catalog import normalize, paginate, plain
from app.errors import NotFound, field_error
from app.models import (
    Collection,
    Connexion,
    Creature,
    DemandeSuppression,
    DemandeSuppressionJoueur,
    Famille,
    Rarete,
    Role,
    StatutDemande,
    Utilisateur,
)
from app.schemas.admin import DailyCount, Period
from app.schemas.admin_accounts import (
    AdminAccountIn,
    AdminAccountOut,
    AdminPlayerDetailOut,
    AdminPlayerOut,
    AdminSummaryOut,
    DeletionRequestIn,
    FamilyCount,
    Granularity,
    LoginHistory,
    PlayerSort,
    RarityCount,
    SortOrder,
)
from app.schemas.base import PageParams, PageResult
from app.schemas.catalog import FamilyOut, RaritySummaryOut
from app.security import hash_password

# ── Joueurs ──────────────────────────────────────────────────────────────────


def _player_query(period: Period):
    """Joueurs avec dernière connexion, connexions sur la période, cartes et demande en attente."""
    me = Utilisateur.id
    last_login = select(func.max(Connexion.le)).where(Connexion.utilisateur_id == me).scalar_subquery()
    logins = (
        select(func.count())
        .where(Connexion.utilisateur_id == me, _local_day(Connexion.le).between(period.date_from, period.date_to))
        .scalar_subquery()
    )
    cards = select(func.coalesce(func.sum(Collection.quantite), 0)).where(Collection.utilisateur_id == me).scalar_subquery()
    pending = (
        select(DemandeSuppressionJoueur.demande_id)
        .join(DemandeSuppression, DemandeSuppression.id == DemandeSuppressionJoueur.demande_id)
        .where(DemandeSuppressionJoueur.utilisateur_id == me, DemandeSuppression.statut == StatutDemande.EN_ATTENTE)
        .limit(1)
        .scalar_subquery()
    )
    columns = {
        PlayerSort.LAST_LOGIN_AT: last_login.label("last_login_at"),
        PlayerSort.LOGINS: logins.label("logins_in_period"),
        PlayerSort.TOTAL_CARDS: cards.label("total_cards"),
    }
    # Un joueur qui a supprimé son compte (anonymisé, 09_evolution_gestion_compte.sql) n'apparaît plus.
    query = select(Utilisateur, *columns.values(), pending.label("pending_request")).where(
        Utilisateur.role == Role.JOUEUR, Utilisateur.supprime_le.is_(None)
    )
    return query, columns


def _player_out(row) -> AdminPlayerOut:
    user, last_login_at, logins, cards, pending = row
    return AdminPlayerOut(
        id=user.id,
        pseudo=user.pseudo,
        login=user.identifiant,
        created_at=user.cree_le,
        last_login_at=last_login_at,
        logins_in_period=logins,
        total_cards=cards,
        pending_deletion_request_id=pending,
    )


def expire_requests(db: Session) -> None:
    """Demandes en attente depuis plus de 7 jours : expirées (rien n'est supprimé)."""
    db.execute(select(func.creatura_expirer_demandes()))
    db.commit()


def list_players(
    db: Session,
    period: Period,
    params: PageParams,
    search: str | None = None,
    sort: PlayerSort = PlayerSort.PSEUDO,
    order: SortOrder = SortOrder.ASC,
) -> PageResult:
    expire_requests(db)
    query, columns = _player_query(period)
    if search:
        query = query.where(plain(Utilisateur.pseudo).contains(normalize(search), autoescape=True))
    key = {PlayerSort.PSEUDO: func.lower(Utilisateur.pseudo), PlayerSort.CREATED_AT: Utilisateur.cree_le}.get(sort)
    if key is None:
        key = columns[sort]
    key = key.desc() if order == SortOrder.DESC else key.asc()
    query = query.order_by(nulls_last(key), func.lower(Utilisateur.pseudo), Utilisateur.id)
    result = paginate(db, query, params, scalars=False)
    return PageResult(rows=[_player_out(r) for r in result.rows], total=result.total, params=params)


def _month_start(column):
    """Premier jour du mois (heure de Paris) d'un timestamptz."""
    return cast(func.date_trunc("month", func.timezone(get_settings().timezone, column)), Date)


def _months(period: Period) -> list[date]:
    months, d = [], period.date_from.replace(day=1)
    while d <= period.date_to:
        months.append(d)
        d = date(d.year + d.month // 12, d.month % 12 + 1, 1)
    return months


def player_detail(db: Session, player_id: uuid.UUID, period: Period, granularity: Granularity) -> AdminPlayerDetailOut:
    expire_requests(db)
    query, _ = _player_query(period)
    row = db.execute(query.where(Utilisateur.id == player_id)).first()
    if row is None:
        raise NotFound("Ce joueur n'existe pas.")

    owned = (
        select(Creature.rarete, Creature.famille, func.sum(Collection.quantite), func.count())
        .join(Creature, Creature.id == Collection.creature_id)
        .where(Collection.utilisateur_id == player_id, Collection.quantite > 0)
        .group_by(Creature.rarete, Creature.famille)
    )
    by_rarity = {r: [0, 0] for r in Rarete}
    by_family = {f: [0, 0] for f in Famille}
    for rarete, famille, cards, distinct in db.execute(owned):
        for counts in (by_rarity[rarete], by_family[famille]):
            counts[0] += cards
            counts[1] += distinct

    in_period = (Connexion.utilisateur_id == player_id, _local_day(Connexion.le).between(period.date_from, period.date_to))
    if granularity == Granularity.DAY:
        bucket, buckets = _local_day(Connexion.le), _days(period)
    else:
        bucket, buckets = _month_start(Connexion.le), _months(period)
    counts = dict(db.execute(select(bucket, func.count()).where(*in_period).group_by(bucket)).all())

    return AdminPlayerDetailOut(
        player=_player_out(row),
        cards_by_rarity=[
            RarityCount(rarity=RaritySummaryOut.of(r), cards=c, distinct_creatures=n) for r, (c, n) in by_rarity.items()
        ],
        cards_by_family=[
            FamilyCount(family=FamilyOut.of(f), cards=c, distinct_creatures=n) for f, (c, n) in by_family.items()
        ],
        logins=LoginHistory(
            granularity=granularity, points=[DailyCount(date=d, count=counts.get(d, 0)) for d in buckets]
        ),
    )


# ── Demandes de suppression ──────────────────────────────────────────────────


def get_request(db: Session, request_id: uuid.UUID) -> DemandeSuppression:
    request = db.get(DemandeSuppression, request_id, populate_existing=True)
    if request is None:
        raise NotFound("Cette demande n'existe pas.")
    return request


def list_requests(
    db: Session,
    params: PageParams,
    status: StatutDemande | None = None,
    validator_id: uuid.UUID | None = None,
) -> PageResult:
    """Toutes les demandes (journal compris), de la plus récente à la plus ancienne."""
    expire_requests(db)
    query = select(DemandeSuppression)
    if status is not None:
        query = query.where(DemandeSuppression.statut == status)
    if validator_id is not None:
        query = query.where(DemandeSuppression.valideur_id == validator_id)
    return paginate(db, query.order_by(DemandeSuppression.cree_le.desc(), DemandeSuppression.id), params)


def create_request(db: Session, admin: Utilisateur, data: DeletionRequestIn) -> DemandeSuppression:
    request_id = db.execute(
        text("SELECT creatura_demander_suppression(:demandeur, :valideur, CAST(:joueurs AS uuid[]), :motif)"),
        {"demandeur": admin.id, "valideur": data.validator_id, "joueurs": data.player_ids, "motif": data.reason},
    ).scalar_one()
    db.commit()
    return get_request(db, request_id)


def decide_request(db: Session, admin: Utilisateur, request_id: uuid.UUID, approve: bool) -> DemandeSuppression:
    """Validation (les joueurs sont supprimés tout de suite) ou refus, par le validateur choisi."""
    db.execute(
        text("SELECT creatura_traiter_demande(:demande, :admin, :valider)"),
        {"demande": request_id, "admin": admin.id, "valider": approve},
    )
    db.commit()
    return get_request(db, request_id)


def cancel_request(db: Session, admin: Utilisateur, request_id: uuid.UUID) -> DemandeSuppression:
    db.execute(text("SELECT creatura_annuler_demande(:demande, :admin)"), {"demande": request_id, "admin": admin.id})
    db.commit()
    return get_request(db, request_id)


# ── Comptes admin ────────────────────────────────────────────────────────────


def list_admins(db: Session) -> list[AdminAccountOut]:
    """Tous les admins, actifs d'abord, puis par pseudo. Un admin qui a supprimé son compte n'apparaît plus."""
    admins = list(
        db.scalars(select(Utilisateur).where(Utilisateur.role == Role.ADMIN, Utilisateur.supprime_le.is_(None)))
    )
    by_id = {a.id: a for a in admins}
    last_logins = dict(
        db.execute(
            select(Connexion.utilisateur_id, func.max(Connexion.le))
            .where(Connexion.utilisateur_id.in_(by_id))
            .group_by(Connexion.utilisateur_id)
        ).all()
    )

    def summary(admin_id: uuid.UUID | None) -> AdminSummaryOut | None:
        admin = by_id.get(admin_id) if admin_id else None
        return AdminSummaryOut(id=admin.id, pseudo=admin.pseudo) if admin else None

    admins.sort(key=lambda a: (a.desactive_le is not None, a.pseudo.lower()))
    return [
        AdminAccountOut(
            id=a.id,
            pseudo=a.pseudo,
            login=a.identifiant,
            created_at=a.cree_le,
            created_by=summary(a.cree_par),
            last_login_at=last_logins.get(a.id),
            must_change_password=a.mot_de_passe_provisoire,
            active=a.desactive_le is None,
            deactivated_at=a.desactive_le,
            deactivated_by=summary(a.desactive_par),
        )
        for a in admins
    ]


def _admin_out(db: Session, admin_id: uuid.UUID) -> AdminAccountOut:
    return next(a for a in list_admins(db) if a.id == admin_id)


def create_admin(db: Session, creator: Utilisateur, data: AdminAccountIn) -> AdminAccountOut:
    """Nouvel admin, avec un mot de passe provisoire qu'il remplacera à sa première connexion."""
    if db.scalar(select(Utilisateur.id).where(Utilisateur.identifiant == data.login)):
        raise field_error("LOGIN_ALREADY_USED", "login", "Cet identifiant est déjà utilisé.")
    if db.scalar(select(Utilisateur.id).where(func.lower(Utilisateur.pseudo) == data.pseudo.lower())):
        raise field_error("PSEUDO_ALREADY_USED", "pseudo", "Ce pseudonyme est déjà pris.")
    admin = Utilisateur(
        pseudo=data.pseudo,
        identifiant=data.login,
        mot_de_passe_hash=hash_password(data.temporary_password),
        role=Role.ADMIN,
        cree_par=creator.id,
        mot_de_passe_provisoire=True,
    )
    db.add(admin)
    db.commit()  # création simultanée : uq_utilisateur_*, traduit par app.errors
    return _admin_out(db, admin.id)


def deactivate_admin(db: Session, admin: Utilisateur, target_id: uuid.UUID) -> AdminAccountOut:
    """Un admin désactive un autre admin (jamais lui-même) ; ses demandes en attente sont annulées."""
    db.execute(text("SELECT creatura_desactiver_admin(:cible, :admin)"), {"cible": target_id, "admin": admin.id})
    db.commit()
    return _admin_out(db, target_id)
