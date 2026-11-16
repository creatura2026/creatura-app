"""Expiration des sessions pour inactivité (SESSION_IDLE_MINUTES) : durée de vie des jetons."""

from datetime import timedelta

import jwt
import pytest
from conftest import API, problem, register_and_login

from app.config import get_settings
from app.models import utcnow


@pytest.fixture
def idle_two_minutes(monkeypatch):
    """Le réglage du test en conditions réelles : 2 minutes sans activité."""
    monkeypatch.setenv("SESSION_IDLE_MINUTES", "2")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _claims(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


def _lifetime(token: str) -> timedelta:
    claims = _claims(token)
    return timedelta(seconds=claims["exp"] - claims["iat"])


def _expired_refresh(user_id: str, role: str = "PLAYER") -> str:
    """Jeton de rafraîchissement valide mais dont l'échéance est passée."""
    settings = get_settings()
    now = utcnow()
    payload = {"sub": user_id, "type": "refresh", "role": role, "iat": now - timedelta(minutes=10), "exp": now - timedelta(seconds=1)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def test_default_is_twenty_minutes(client):
    p = register_and_login(client, "Iris")
    tokens = p["tokens"]
    assert tokens["sessionIdleSeconds"] == 20 * 60
    assert tokens["expiresIn"] == 15 * 60  # jeton d'accès : 15 min, moins que l'inactivité permise
    assert _lifetime(tokens["accessToken"]) == timedelta(minutes=15)
    # Rafraîchissement : 20 min + 25 % de marge, et non plus 7 jours.
    assert _lifetime(tokens["refreshToken"]) == timedelta(minutes=25)


def test_two_minutes_setting(idle_two_minutes, client):
    p = register_and_login(client, "Jade")
    tokens = p["tokens"]
    assert tokens["sessionIdleSeconds"] == 120
    # Le jeton d'accès ne dure jamais plus que l'inactivité permise.
    assert tokens["expiresIn"] == 120 and _lifetime(tokens["accessToken"]) == timedelta(minutes=2)
    assert _lifetime(tokens["refreshToken"]) == timedelta(minutes=2.5)


def test_refresh_slides_the_session_while_active(idle_two_minutes, client):
    p = register_and_login(client, "Kim")
    r = client.post(f"{API}/auth/refresh", json={"refreshToken": p["tokens"]["refreshToken"]})
    assert r.status_code == 200, r.text
    renewed = r.json()
    assert renewed["sessionIdleSeconds"] == 120
    # Nouvelle échéance calculée à partir de maintenant.
    assert _claims(renewed["refreshToken"])["exp"] >= _claims(p["tokens"]["refreshToken"])["exp"]


def test_abandoned_session_cannot_be_renewed(client):
    p = register_and_login(client, "Lou")
    stale = _expired_refresh(str(p["id"]))
    body = problem(client.post(f"{API}/auth/refresh", json={"refreshToken": stale}), 401, "UNAUTHENTICATED")
    assert "expiré" in body["detail"]
