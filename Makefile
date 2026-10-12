.PHONY: setup check backend-check web-check widgets-check openapi build-web build-widgets publish-web publish-widgets

PY := backend/.venv/bin/python
ifeq ($(OS),Windows_NT)
PY := backend/.venv/Scripts/python.exe
endif

setup:
	python -m venv backend/.venv
	$(PY) -m pip install -r backend/requirements-dev.txt
	cd web && npm ci
	cd widgets && npm ci

check: backend-check web-check widgets-check

backend-check:
	cd backend && ../$(PY) -m ruff format --check src tests scripts
	cd backend && ../$(PY) -m ruff check src tests scripts
	cd backend && ../$(PY) -m mypy src
	cd backend && ../$(PY) -m pytest

web-check:
	cd web && npm run lint && npm run typecheck && npm test

widgets-check:
	cd widgets && npm run lint && npm run typecheck && npm test

openapi:
	cd backend && ../$(PY) scripts/export_openapi.py

build-web:
	cd web && npm run build

build-widgets:
	cd widgets && npm run build

# Needs: CONSOLE_BUCKET, CONFIG_BUCKET, CONSOLE_DISTRIBUTION_ID, EDGE_DISTRIBUTION_ID (stack outputs)
publish-web: build-web
	aws s3 sync web/dist s3://$(CONSOLE_BUCKET) --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html
	aws s3 cp web/dist/index.html s3://$(CONSOLE_BUCKET)/index.html --cache-control "no-cache"
	aws cloudfront create-invalidation --distribution-id $(CONSOLE_DISTRIBUTION_ID) --paths /index.html

publish-widgets: build-widgets
	aws s3 sync widgets/dist s3://$(CONFIG_BUCKET)/w --cache-control "public,max-age=31536000,immutable" --exclude "loader.js"
	aws s3 cp widgets/dist/loader.js s3://$(CONFIG_BUCKET)/w/loader.js --cache-control "public,max-age=300,stale-while-revalidate=3600"
	aws cloudfront create-invalidation --distribution-id $(EDGE_DISTRIBUTION_ID) --paths /w/loader.js
