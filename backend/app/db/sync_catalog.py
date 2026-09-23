from __future__ import annotations

import asyncio
import sys

from app.integrations.ekt.client import EktApiClient
from app.main import catalog, database


async def sync_catalog(max_pages: int = 10_000) -> int:
    """Fetch list pages and persist a local searchable catalog."""

    if not database.configured:
        raise RuntimeError(
            "DATABASE_URL is required for catalog synchronization"
        )

    await database.open()

    client = EktApiClient()

    synced = 0
    seen: set[int] = set()

    try:
        await client.start()

        if not client.configured:
            raise RuntimeError(
                "Set EKT_API_USERNAME and EKT_API_PASSWORD"
            )

        for page in range(1, max_pages + 1):
            print(f"Fetching page {page}...")

            response = await client.get_products(page)

            if not response.items:
                print("No more products.")
                break

            new_items = [
                item
                for item in response.items
                if item.id not in seen
            ]

            if not new_items:
                print("No new product IDs found. Stopping.")
                break

            for item in new_items:
                seen.add(item.id)

                catalog.repository.upsert(item)
                await database.save_product(item)

                synced += 1

            print(
                f"Page {page}: "
                f"{len(new_items)} products synchronized "
                f"(total: {synced})"
            )

            if len(response.items) < response.per_page:
                print("Reached last page.")
                break

    finally:
        await client.close()
        await database.close()

    return synced


def main() -> None:
    # Psycopg async on Windows requires SelectorEventLoop.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(
            asyncio.WindowsSelectorEventLoopPolicy()
        )

    synced = asyncio.run(sync_catalog())

    print(f"Synchronized {synced} products")


if __name__ == "__main__":
    main()