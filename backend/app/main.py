from pathlib import Path

from fastapi import FastAPI

from app.api import health, products
from app.integrations.ekt.schemas import ProductDetail, ProductListResponse
from app.repositories.product_repository import ProductRepository
from app.services.catalog_service import CatalogService


def _load_sample_catalog() -> tuple[ProductRepository, dict[int, ProductDetail]]:
    # Optional local fixtures. Files are read only when present in the repository.
    root = Path(__file__).resolve().parents[2]
    products = {}
    details: dict[int, ProductDetail] = {}
    for filename in ("products.json", "products (1).json"):
        path = root / "data" / filename
        if not path.is_file():
            continue
        payload = ProductListResponse.model_validate_json(path.read_text(encoding="utf-8"))
        products.update({item.id: item for item in payload.items})
    detail_path = root / "data" / "detail.json"
    if detail_path.is_file():
        detail = ProductDetail.model_validate_json(detail_path.read_text(encoding="utf-8"))
        details[detail.id] = detail
        if detail.id not in products:
            from app.integrations.ekt.schemas import ProductListItem

            products[detail.id] = ProductListItem(
                id=detail.id,
                name=detail.name,
                article=detail.article,
                price=detail.price,
                image=detail.image,
                url=detail.url,
            )
    repository = ProductRepository(products.values())
    repository._details.update(details)
    return repository, details


repository, _details = _load_sample_catalog()
catalog = CatalogService(repository)
app = FastAPI(title="EKT Product API", version="0.1.0")
app.include_router(health.router)
app.include_router(products.router)
