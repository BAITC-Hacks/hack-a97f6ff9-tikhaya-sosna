from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.integrations.ekt.schemas import ProductListItem

router = APIRouter(prefix="/api/v1", tags=["chat"])


class PageContext(BaseModel):
    url: str | None = None
    origin: str | None = None
    city: str | None = None
    current_product_id: int | None = None


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=8000)
    attachment_ids: list[str] = Field(default_factory=list)
    page_context: PageContext = Field(default_factory=PageContext)


class ChatResponse(BaseModel):
    message: str
    products: list[ProductListItem] = Field(default_factory=list)
    cart_proposal: dict[str, Any] | None = None


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, limit: int = Query(default=5, ge=1, le=20)):
    from app.main import catalog, database

    if request.page_context.current_product_id:
        item = catalog.get_product(request.page_context.current_product_id)
        products = [item] if item else []
    elif database.pool is not None:
        products = await database.search_products(request.message, limit)
    else:
        products = catalog.search(request.message)[:limit]
    if not products:
        message = "Не нашёл совпадений в доступном каталоге. Попробуйте указать артикул или ID товара."
    else:
        message = "Нашёл товары в каталоге. Цену и наличие уточняйте по актуальной карточке товара."
    return ChatResponse(message=message, products=products)
