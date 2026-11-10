from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue depuis les variables d'environnement (ou le fichier .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL uniquement : le schéma (db/*.sql) utilise des fonctionnalités propres à Postgres.
    database_url: str = "postgresql+psycopg://creatura:creatura-dev@localhost:5432/creatura"

    jwt_secret: str = "dev-only-secret-change-me-in-production-please-0123456789"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    # Règles du booster : à valider au point client.
    booster_size: int = 5
    # Fuseau qui définit le « jour » du booster (calculé par Postgres, RDS étant en UTC).
    timezone: str = "Europe/Paris"

    cors_origins: str = "*"

    # Compte administrateur créé au démarrage s'il n'existe pas (mot de passe haché par le back).
    admin_login: str | None = None
    admin_password: str | None = None
    admin_pseudo: str = "Admin"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
