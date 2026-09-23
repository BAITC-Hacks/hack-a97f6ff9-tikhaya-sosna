from fastapi import APIRouter, HTTPException, Query, Request

from app.integrations.ekt.client import EktApiError
from app.integrations.ekt.mapper import detail_to_list_item
from app.integrations.ekt.schemas import ProductDetail, ProductListItem, ProductListResponse

router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("/")
async def list_products(page: int = Query(default=1, ge=1)):
    from app.main import catalog, database, ekt_client

    if ekt_client.configured:
        try:
            result = await ekt_client.get_products(page)
            for item in result.items:
                catalog.repository.upsert(item)
                await database.save_product(item)
            return result
        except EktApiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    items, count = catalog.list_products(page, 20)
    return ProductListResponse(page=page, per_page=20, count=count, items=items)


@router.get("/search", response_model=list[ProductListItem])
async def search_products(q: str = Query(min_length=1, max_length=200), limit: int = Query(default=20, ge=1, le=100)):
    from app.main import catalog, database

    if database.pool is not None:
        return await database.search_products(q, limit)
    return catalog.search(q)[:limit]


@router.get("/{product_id}", response_model=ProductListItem)
async def get_product(product_id: int):
    from app.main import catalog, database

    product = catalog.get_product(product_id)
    if product is None:
        product = await database.find_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/detail", response_model=ProductDetail)
async def get_product_detail(product_id: int, city: str | None = None):
    from app.main import catalog, database, ekt_client

    if ekt_client.configured:
        try:
            detail = await ekt_client.get_product_detail(product_id)
            item = detail_to_list_item(detail)
            catalog.remember_detail(detail)
            await database.save_product(item, detail)
            return detail
        except EktApiError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    detail = catalog.get_detail(product_id) or await database.find_detail(product_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Product detail not found")
    if city:
        # Keep all warehouse data in the response; the requested city's stock is explicit.
        return {**detail.model_dump(mode="json"), "requested_city": city,
                "requested_city_stock": detail.stock_in_store(city)}
    return detail
