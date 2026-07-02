"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Application ---
    app_name: str = "Zledger"
    version: str = "0.1.0"
    debug: bool = False

    # --- Auth / JWT ---
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # --- Bootstrap admin (created on first run only) ---
    bootstrap_admin_email: str = "admin@zledger.com"
    bootstrap_admin_password: str = "admin12345"
    bootstrap_admin_name: str = "Administrator"

    # --- Database ---
    database_url: str = "postgresql+psycopg://zledger:zledger@db:5432/zledger"
    # Fallback pieces (used to compose DATABASE_URL when not provided explicitly)
    postgres_user: str = "zledger"
    postgres_password: str = "zledger"
    postgres_db: str = "zledger"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # --- E-Invoice ---
    einvoice_enabled: bool = False
    einvoice_env: str = "sandbox"
    einvoice_gstin: str = ""
    einvoice_client_id: str = ""
    einvoice_client_secret: str = ""
    einvoice_username: str = ""
    einvoice_password: str = ""

    @property
    def einvoice_api_url(self) -> str:
        if self.einvoice_env == "sandbox":
            return "https://einvoice1-trial.nic.in"
        return "https://einvoice1.gst.gov.in"

    # --- E-Way Bill ---
    eway_bill_enabled: bool = False
    eway_bill_env: str = "sandbox"
    eway_bill_gstin: str = ""
    eway_bill_username: str = ""
    eway_bill_password: str = ""

    @property
    def eway_bill_api_url(self) -> str:
        if self.eway_bill_env == "sandbox":
            return "https://ewaybill-trial.nic.in"
        return "https://ewaybill1.gst.gov.in"

    # --- CORS ---
    # Comma-separated origins
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # --- Cron / Scheduler ---
    cron_enabled: bool = False
    cron_interval_minutes: int = 15

    @property
    def effective_database_url(self) -> str:
        # If DATABASE_URL is the default placeholder, compose from pieces.
        # This keeps local dev + docker both working.
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
