# Zledger — convenience Makefile
# Work around the docker-compose recreate bug (KeyError: 'ContainerConfig')
# by removing affected containers before `up`.

COMPOSE := docker-compose
PROJECT := zledger
.PHONY: help up down ps logs build rebuild rebuild-api rebuild-web migrate seed setup clean lint migration-check typecheck e2e-typecheck

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

rebuild-web:  ## Rebuild + restart web
	docker compose build web
	docker compose up -d web

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


migration-check:  ## Check migration integrity (no missing revisions)
	$(COMPOSE) exec -T api bash -c "alembic upgrade head && alembic check" || echo "alembic check not supported in this version; upgrade only"

lint:  ## Run ruff linter and formatter
	$(COMPOSE) exec -T api ruff check --fix app/ scripts/
	$(COMPOSE) exec -T api ruff format app/ scripts/

e2e-typecheck:  ## Typecheck the E2E specs (tests/e2e must stay at 0 errors)
	cd tests/e2e && npx tsc --noEmit -p tsconfig.json

typecheck:  ## Typecheck frontend + E2E specs in one command
	cd frontend && npx tsc --noEmit
	$(MAKE) e2e-typecheck