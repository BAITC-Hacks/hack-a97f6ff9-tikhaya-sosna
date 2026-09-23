from __future__ import annotations

import asyncio

from app.integrations.ekt.client import EktApiClient
from app.main import catalog, database


async def sync_catalog(max_pages: int = 10_000) -> int:
    """Fetch list pages and persist a local searchable catalog."""
    if not database.configured:
        raise RuntimeError("DATABASE_URL is required for catalog synchronization")
    await database.open()
    client = EktApiClient()
    synced = 0
    seen: set[int] = set()
    try:
        await client.start()
        if not client.configured:
            raise RuntimeError("Set EKT_API_USERNAME and EKT_API_PASSWORD")
        for page in range(1, max_pages + 1):
            response = await client.get_products(page)
            new_items = [item for item in response.items if item.id not in seen]
            if not new_items:
                break
            for item in new_items:
                seen.add(item.id)
                catalog.repository.upsert(item)
                await database.save_product(item)
                synced += 1
            if len(response.items) < response.per_page:
                break
    finally:
        await client.close()
        await database.close()
    return synced


if __name__ == "__main__":
    print(f"Synchronized {asyncio.run(sync_catalog())} products")
