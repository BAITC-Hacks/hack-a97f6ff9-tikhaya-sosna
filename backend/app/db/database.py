from __future__ import annotations

import os
from typing import Any

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.integrations.ekt.schemas import ProductDetail, ProductListItem


class Database:
    def __init__(self) -> None:
        self._dsn = os.getenv("DATABASE_URL", "")
        self.pool: AsyncConnectionPool | None = None

    @property
    def configured(self) -> bool:
        return bool(self._dsn)

    async def open(self) -> None:
        if not self._dsn:
            return
        self.pool = AsyncConnectionPool(self._dsn, min_size=1, max_size=8, open=False, kwargs={"row_factory": dict_row})
        await self.pool.open()
        await self.pool.wait()
        async with self.pool.connection() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id BIGINT PRIMARY KEY,
                    article TEXT,
                    supplier_article TEXT,
                    barcode TEXT,
                    name TEXT NOT NULL,
                    price NUMERIC(14, 2),
                    list_data JSONB NOT NULL,
                    detail_data JSONB,
                    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING GIN (name gin_trgm_ops)")
            await conn.execute("CREATE INDEX IF NOT EXISTS products_article_idx ON products (article)")
            await conn.execute("CREATE INDEX IF NOT EXISTS products_supplier_article_idx ON products (supplier_article)")
            await conn.execute("CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS product_stock (
                    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    store_id BIGINT NOT NULL,
                    store_name TEXT NOT NULL,
                    quantity INTEGER NOT NULL CHECK (quantity >= 0),
                    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (product_id, store_id)
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pending_cart_actions (
                    action_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    product_id BIGINT NOT NULL REFERENCES products(id),
                    quantity INTEGER NOT NULL CHECK (quantity > 0),
                    available_quantity INTEGER NOT NULL,
                    city TEXT,
                    status TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.commit()

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    async def save_product(self, item: ProductListItem, detail: ProductDetail | None = None) -> None:
        if self.pool is None:
            return
        list_data = item.model_dump(mode="json")
        detail_data = detail.model_dump(mode="json") if detail else None
        async with self.pool.connection() as conn:
            await conn.execute("""
                INSERT INTO products (id, article, supplier_article, barcode, name, price, list_data, detail_data, synced_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET article=EXCLUDED.article,
                    supplier_article=EXCLUDED.supplier_article, barcode=EXCLUDED.barcode,
                    name=EXCLUDED.name, price=EXCLUDED.price, list_data=EXCLUDED.list_data,
                    detail_data=COALESCE(EXCLUDED.detail_data, products.detail_data), synced_at=NOW()
            """, (item.id, item.article, item.supplier_article, item.barcode, item.name,
                  item.price, Jsonb(list_data), Jsonb(detail_data) if detail_data else None))
            if detail is not None:
                await conn.execute("DELETE FROM product_stock WHERE product_id=%s", (detail.id,))
                for store in detail.stores:
                    await conn.execute("""
                        INSERT INTO product_stock (product_id, store_id, store_name, quantity, checked_at)
                        VALUES (%s, %s, %s, %s, NOW())
                        ON CONFLICT (product_id, store_id) DO UPDATE SET
                            store_name=EXCLUDED.store_name, quantity=EXCLUDED.quantity, checked_at=NOW()
                    """, (detail.id, store.id, store.name, max(store.quantity, 0)))
            await conn.commit()

    async def load_products(self) -> list[ProductListItem]:
        if self.pool is None:
            return []
        async with self.pool.connection() as conn:
            cursor = await conn.execute("SELECT list_data FROM products ORDER BY id")
            rows = await cursor.fetchall()
        return [ProductListItem.model_validate(row["list_data"]) for row in rows]

    async def find_product(self, product_id: int) -> ProductListItem | None:
        if self.pool is None:
            return None
        async with self.pool.connection() as conn:
            cursor = await conn.execute("SELECT list_data FROM products WHERE id=%s", (product_id,))
            row = await cursor.fetchone()
        return ProductListItem.model_validate(row["list_data"]) if row else None

    async def find_detail(self, product_id: int) -> ProductDetail | None:
        if self.pool is None:
            return None
        async with self.pool.connection() as conn:
            cursor = await conn.execute("SELECT detail_data FROM products WHERE id=%s", (product_id,))
            row = await cursor.fetchone()
        return ProductDetail.model_validate(row["detail_data"]) if row and row["detail_data"] else None

    async def search_products(self, query: str, limit: int = 20) -> list[ProductListItem]:
        if self.pool is None:
            return []
        pattern = f"%{query.strip()}%"
        async with self.pool.connection() as conn:
            cursor = await conn.execute("""
                SELECT list_data FROM products
                WHERE id::text = %s OR article ILIKE %s OR supplier_article ILIKE %s
                   OR barcode ILIKE %s OR name ILIKE %s
                   OR list_data::text ILIKE %s
                ORDER BY CASE WHEN id::text=%s OR article=%s OR supplier_article=%s OR barcode=%s THEN 0 ELSE 1 END,
                         similarity(name, %s) DESC
                LIMIT %s
            """, (query.strip(), pattern, pattern, pattern, pattern, pattern,
                  query.strip(), query.strip(), query.strip(), query.strip(), query.strip(), limit))
            rows = await cursor.fetchall()
        return [ProductListItem.model_validate(row["list_data"]) for row in rows]

    async def create_cart_action(self, action: dict[str, Any]) -> None:
        if self.pool is None:
            return
        async with self.pool.connection() as conn:
            await conn.execute("""
                INSERT INTO pending_cart_actions
                (action_id, session_id, product_id, quantity, available_quantity, city, status, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (action["action_id"], action["session_id"], action["product_id"], action["quantity"],
                  action["available_quantity"], action.get("city"), action["status"], action["expires_at"]))
            await conn.commit()

    async def get_cart_action(self, action_id: str) -> dict[str, Any] | None:
        if self.pool is None:
            return None
        async with self.pool.connection() as conn:
            cursor = await conn.execute("SELECT * FROM pending_cart_actions WHERE action_id=%s", (action_id,))
            return await cursor.fetchone()

    async def update_cart_action(self, action_id: str, status: str) -> None:
        if self.pool is None:
            return
        async with self.pool.connection() as conn:
            await conn.execute("UPDATE pending_cart_actions SET status=%s, updated_at=NOW() WHERE action_id=%s", (status, action_id))
            await conn.commit()

    async def consume_cart_action(self, action_id: str, stock: int) -> dict[str, Any] | None:
        if self.pool is None:
            return None
        async with self.pool.connection() as conn:
            cursor = await conn.execute("""
                UPDATE pending_cart_actions
                SET status='validated', updated_at=NOW()
                WHERE action_id=%s AND status='pending_confirmation'
                  AND expires_at > NOW() AND quantity <= %s
                RETURNING *
            """, (action_id, stock))
            row = await cursor.fetchone()
            await conn.commit()
            return row
