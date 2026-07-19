# Zledger — convenience Makefile
# Work around the docker-compose recreate bug (KeyError: 'ContainerConfig')
# by removing affected containers before `up`.

COMPOSE := docker-compose
PROJECT := zledger

.PHONY: help up down ps logs build rebuild rebuild-api rebuild-web migrate seed setup clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up:  ## Start all services (db, api, web)
	$(COMPOSE) up -d

down:  ## Stop all services (keeps volumes)
	$(COMPOSE) down

ps:  ## Show container status
	$(COMPOSE) ps

logs:  ## Tail logs for all services
	$(COMPOSE) logs -f --tail=100

build:  ## Build all images
	$(COMPOSE) build

# Rebuild a single service safely: remove its container first (avoids the
# ContainerConfig KeyError that plain `up -d` hits after an image change).
rebuild-api:  ## Rebuild + restart api (with migrations on start)
	-docker rm -f $(PROJECT)_api_1
	$(COMPOSE) build api
	$(COMPOSE) up -d api

# `web_e2e` has NO build context — it reuses the `zledger-web:latest` image
# produced by the `web` service. So a frontend rebuild MUST also restart
# `web_e2e`, otherwise the E2E stack keeps serving the stale bundle.
#
# Use `docker compose` (v2), NOT the v1 `docker-compose` binary: v1 hits a
# "KeyError: 'ContainerConfig'" when recreating a container whose image changed.
rebuild-web:  ## Rebuild + restart web AND web_e2e (E2E shares the web image)
	docker compose build web
	docker compose up -d web
	-docker rm -f zledger_web_e2e_1
	docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d web_e2e

rebuild:  ## Rebuild api + web
	$(MAKE) rebuild-api
	$(MAKE) rebuild-web

migrate:  ## Run Alembic migrations to head inside the api container
	$(COMPOSE) exec -T api alembic upgrade head

seed:  ## Re-seed demo data
	$(COMPOSE) exec -T api python -m scripts.seed_demo_data

setup:  ## One-command setup: .env + build stack + health check (+ optional demo seed/GDrive)
	./setup.sh

clean:  ## Stop + remove containers and orphaned images (keeps named volumes)
	$(COMPOSE) down --remove-orphans
	-docker rm -f $(PROJECT)_api_1 $(PROJECT)_web_1
