"""Authentification IAM sur RDS : le jeton est signé localement, sans appel à AWS."""

from urllib.parse import parse_qs, urlsplit

from app.config import Settings
from app.database import rds_iam_token_provider


def test_iam_token_is_signed_for_the_database_user():
    settings = Settings(
        database_url="postgres://creatura_back@exemple.eu-north-1.rds.amazonaws.com:5432/creatura?sslmode=require",
        db_iam_auth=True,
        aws_region="eu-north-1",
        aws_access_key_id="AKIAEXEMPLE",
        aws_secret_access_key="secret-de-test",
    )
    token = rds_iam_token_provider(settings)()

    url = urlsplit("https://" + token)
    query = parse_qs(url.query)
    assert url.hostname == "exemple.eu-north-1.rds.amazonaws.com" and url.port == 5432
    assert query["Action"] == ["connect"] and query["DBUser"] == ["creatura_back"]
    assert query["X-Amz-Credential"][0].startswith("AKIAEXEMPLE/") and "/eu-north-1/rds-db/" in query["X-Amz-Credential"][0]
    assert query["X-Amz-Expires"] == ["900"]


def test_behind_a_tunnel_the_token_is_signed_for_the_real_database():
    """Tunnel SSM : connexion à localhost:15432, jeton signé pour l'adresse de la RDS (sinon PAM refuse)."""
    settings = Settings(
        database_url="postgres://creatura_back@localhost:15432/creatura?sslmode=require",
        db_iam_auth=True,
        db_iam_host="exemple.eu-north-1.rds.amazonaws.com",
        db_iam_port=5432,
        aws_region="eu-north-1",
        aws_access_key_id="AKIAEXEMPLE",
        aws_secret_access_key="secret-de-test",
    )
    url = urlsplit("https://" + rds_iam_token_provider(settings)())
    assert url.hostname == "exemple.eu-north-1.rds.amazonaws.com" and url.port == 5432
