"""FastAPI application entrypoint.

Phase 1: app shell with CORS, health endpoint, and router registration hook.
Auth/masters/voucher routers are added in later phases.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1 import api_router
from app.core.config import settings
from app import models  # noqa: F401  (registers all ORM tables on Base.metadata)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Place for startup hooks (caches, connections). DB connections are created
    # per-request via get_db, so nothing to open eagerly here.
    yield


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="Self-hosted Indian accounting system with GST support.",
    lifespan=lifespan,
    # Keep all entrypoints under /api so the nginx reverse-proxy (which only
    # forwards /api/*) serves them too.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, object]:
    """Liveness/readiness probe used by Docker and nginx."""
    return {"status": "ok", "app": settings.app_name, "version": __version__}


@app.get("/api", tags=["system"], include_in_schema=False)
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/api/docs"}


# v1 API routers
app.include_router(api_router, prefix="/api")
