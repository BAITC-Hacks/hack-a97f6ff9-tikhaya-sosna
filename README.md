# hack-a97f6ff9-tikhaya-sosna
Hackathon team repository for Tikhaya Sosna

## Product API

API-слой использует формат ответов EKT из примеров `products.json` и `detail.json`.
Положите эти JSON-файлы в `backend/data/`, чтобы включить их как локальные fixtures
(загрузчик также поддерживает `products (1).json`). Файлы вне репозитория читаются
не будут.

Запуск из корня проекта:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

Маршруты: `GET /health`, `GET /api/v1/products/search?q=...`,
`GET /api/v1/products/{id}` и `GET /api/v1/products/{id}/detail`.
Документация OpenAPI доступна на `/docs`. Пока каталог in-memory и загружается
из локальных fixtures при старте; интеграция с живым EKT API и PostgreSQL
ещё не подключена.
