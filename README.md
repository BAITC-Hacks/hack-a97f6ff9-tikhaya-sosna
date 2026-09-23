# Tikhaya Sosna — EKT API prototype

FastAPI backend for catalog search, live EKT product details and stock, plus a confirmation gate for extension-side cart updates.

## Configuration and startup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

Fill `EKT_API_USERNAME` and `EKT_API_PASSWORD` in `.env` using credentials supplied to your team. Do not commit `.env` or put these credentials into extension code. Start local PostgreSQL if desired:

```bash
docker compose up -d postgres
```

Then run the API from the repository root:

```bash
uvicorn app.main:app --app-dir backend --reload
```

OpenAPI docs are at `http://127.0.0.1:8000/docs`. PostgreSQL is optional for live catalog reads. Without EKT credentials, product routes use sample JSON fixtures from the ignored root `data/` directory if provided.

## API routes

- `GET /health`
- `GET /api/v1/products/?page=1` — live EKT page when credentials are configured, otherwise local page
- `GET /api/v1/products/search?q=027228` — catalog search by ID, article, supplier article, barcode, name, and saved properties
- `GET /api/v1/products/{id}`
- `GET /api/v1/products/{id}/detail?city=Алматы` — detail with warehouse stocks; detail is refreshed from EKT when configured
- `POST /api/v1/chat` — assistant orchestration with catalog search, live detail/stock when configured, alternatives, and a structured three-field response
- `POST /api/v1/cart-actions` — creates a five-minute pending proposal after a fresh stock check
- `POST /api/v1/cart-actions/{action_id}/validate` — rechecks session, one-time state, expiry and current stock after the extension reports user confirmation
- `POST /api/v1/cart-actions/{action_id}/cancel`

The backend never adds an item to the cart. The extension must call EKT's browser-session endpoint only after an explicit user click and use the validation response first. Session IDs currently identify actions but are not authenticated identities; add a signed/session-auth mechanism before public deployment.

## Catalog synchronization

The database creates `products`, `product_stock` and `pending_cart_actions` tables on startup. To fetch product list pages into PostgreSQL, run from the repository root after configuring `.env` and starting PostgreSQL:

```bash
PYTHONPATH=backend python -m app.db.sync_catalog
```

Sync stops on an empty/repeated page or a short page; the upstream `count` field is not assumed to be a total catalog count. Product detail and warehouse stock are fetched from EKT when requested and persisted when PostgreSQL is enabled.

## Current prototype limits

The chat assistant runs deterministic orchestration; no text-generation provider is configured, so explanations are assembled from verified catalog facts. Purchase terms and RECOMMEND have no implemented data source. Without a synchronized PostgreSQL catalog or local fixtures, EKT's detail endpoint alone cannot provide name-based search. Chat cart requests require a selected city/warehouse and only create a pending confirmation action; they do not update a basket. Attachment IDs are accepted by the chat contract but cannot be resolved until file storage is implemented. Cart actions use PostgreSQL when configured and process memory otherwise.
