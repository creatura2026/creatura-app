from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue depuis les variables d'environnement (ou le fichier .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Même format que le reste de l'équipe (voir db/README.md) : postgres://user:mdp@hôte:port/base
    # En production (RDS), ajouter ?sslmode=require.
    database_url: str = "postgres://creatura:creatura@localhost:5432/creatura"

    jwt_secret: str = "dev-only-secret-change-me-in-production-please-0123456789"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    # Le nombre de cartes par booster est un réglage en base (table reglage), modifiable par l'admin.
    # Fuseau qui définit le « jour » du booster (calculé par Postgres, RDS étant en UTC).
    timezone: str = "Europe/Paris"

    cors_origins: str = "*"

    # CDN des illustrations (CloudFront devant le bucket S3) : la clé stockée en base
    # (sprites/moss_puff.png) y est concaténée.
    image_base_url: str = "https://d3tkhh3xjmflkh.cloudfront.net"

    # Compte administrateur créé au démarrage s'il n'existe pas (mot de passe haché par le back).
    admin_login: str | None = None
    admin_password: str | None = None
    admin_pseudo: str = "Admin"

    @field_validator("database_url")
    @classmethod
    def _sqlalchemy_url(cls, url: str) -> str:
        """postgres://… → postgresql+psycopg://… (le format attendu par SQLAlchemy)."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
