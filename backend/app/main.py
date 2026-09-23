from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

from app.integrations.ekt.client import EktApiClient
from app.integrations.ekt.schemas import ProductDetail, ProductListResponse
from app.repositories.cart_repository import CartActionRepository
from app.repositories.product_repository import ProductRepository
from app.services.cart_service import CartActionService
from app.services.catalog_service import CatalogService
from app.assistant.orchestrator import AssistantOrchestrator
from app.assistant.tools import AssistantTools
from app.db.database import Database


def _load_sample_catalog() -> tuple[ProductRepository, dict[int, ProductDetail]]:
    root = Path(__file__).resolve().parents[2]
    products = {}
    details: dict[int, ProductDetail] = {}
    for filename in ("products.json", "products (1).json"):
        path = root / "data" / filename
        if path.is_file():
            payload = ProductListResponse.model_validate_json(path.read_text(encoding="utf-8"))
            products.update({item.id: item for item in payload.items})
    detail_path = root / "data" / "detail.json"
    if detail_path.is_file():
        detail = ProductDetail.model_validate_json(detail_path.read_text(encoding="utf-8"))
        details[detail.id] = detail
        if detail.id not in products:
            from app.integrations.ekt.mapper import detail_to_list_item

            products[detail.id] = detail_to_list_item(detail)
    repository = ProductRepository(products.values())
    for detail in details.values():
        repository.upsert_detail(detail)
    return repository, details


repository, _details = _load_sample_catalog()
catalog = CatalogService(repository)
database = Database()
ekt_client = EktApiClient()
cart_actions = CartActionService(CartActionRepository())
assistant = AssistantOrchestrator(AssistantTools(
    catalog, database=database, ekt_client=ekt_client, cart_actions=cart_actions,
))


@asynccontextmanager
async def lifespan(_: FastAPI):
    await database.open()
    await ekt_client.start()
    if database.pool is not None:
        for product in await database.load_products():
            repository.upsert(product)
    try:
        yield
    finally:
        await ekt_client.close()
        await database.close()


app = FastAPI(title="EKT Product API", version="0.2.0", lifespan=lifespan)

# Import routers after shared services exist to avoid module initialization cycles.
from app.api import cart, chat, health, products  # noqa: E402

app.include_router(health.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(chat.router)
