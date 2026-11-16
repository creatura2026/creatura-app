# syntax=docker/dockerfile:1

# ---- Build : installe les dépendances dans un venv avec uv ----
FROM python:3.13-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.10.3 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Dépendances d'abord (couche mise en cache tant que le lockfile ne change pas).
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY app ./app


# ---- Runtime : image minimale, utilisateur non root ----
FROM python:3.13-slim

RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin creatura

WORKDIR /app
COPY --from=builder /app /app

# DATABASE_URL (PostgreSQL) est fourni à l'exécution : en K8S, par un Secret.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER 10001
EXPOSE 8000

# Un seul processus par conteneur : on monte en charge avec les replicas K8S.
# --proxy-headers : l'IP et le schéma du client viennent de l'Ingress / de l'ALB.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
