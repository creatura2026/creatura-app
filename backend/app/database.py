from collections.abc import Callable, Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app import bus
from app.config import Settings, get_settings


class Base(DeclarativeBase):
    pass


def rds_iam_token_provider(settings: Settings) -> Callable[[], str]:
    """Jeton d'authentification IAM pour RDS, utilisé comme mot de passe PostgreSQL.

    Le jeton est signé localement (aucun appel réseau) et vaut 15 minutes : il suffit à
    ouvrir la connexion, qui reste valide ensuite.
    """
    import boto3  # seulement si l'authentification IAM est activée

    if not settings.aws_region:
        raise RuntimeError("DB_IAM_AUTH=true exige AWS_REGION")
    url = make_url(settings.database_url)
    # Signé pour la vraie RDS, même si la connexion passe par un tunnel (localhost:15432).
    host = settings.db_iam_host or url.host
    port = settings.db_iam_port or url.port or 5432
    client = boto3.session.Session(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_session_token=settings.aws_session_token,
        region_name=settings.aws_region,
    ).client("rds")

    def token() -> str:
        return client.generate_db_auth_token(
            DBHostname=host, Port=port, DBUsername=url.username, Region=settings.aws_region
        )

    return token


def _create_engine():
    settings = get_settings()
    # pool_recycle : les connexions sont renouvelées avant les coupures de RDS ou d'un proxy.
    engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
    if settings.db_iam_auth:
        token = rds_iam_token_provider(settings)

        @event.listens_for(engine, "do_connect")
        def _iam_password(dialect, conn_rec, cargs, cparams):
            cparams["password"] = token()

    return engine


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
# Les événements de salle annoncés pendant une transaction partent à son COMMIT (voir bus.py).
bus.install(SessionLocal)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
