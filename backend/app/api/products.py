from fastapi import APIRouter, HTTPException, Query, Request

from app.integrations.ekt.schemas import ProductDetail, ProductListItem

router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("/search", response_model=list[ProductListItem])
async def search_products(request: Request, q: str = Query(min_length=1, max_length=200)):
    return request.app.state.catalog.search(q)


@router.get("/{product_id}", response_model=ProductListItem)
async def get_product(product_id: int, request: Request):
    catalog = request.app.state.catalog
    product = catalog.get_product(product_id)
    if product is None:
        detail = catalog.get_detail(product_id)
        if detail is not None:
            return {
                "id": detail.id,
                "name": detail.name,
                "article": detail.article,
                "price": detail.price,
                "image": detail.image,
                "url": detail.url,
            }
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/detail", response_model=ProductDetail)
async def get_product_detail(product_id: int, request: Request):
    product = request.app.state.catalog.get_detail(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product detail not found")
    return product
