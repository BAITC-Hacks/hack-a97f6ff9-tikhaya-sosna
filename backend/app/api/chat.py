import re

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.assistant.response_models import AssistantRequest, StructuredResponse
from app.search.query_parser import parse_query

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


class ChatResponse(StructuredResponse):
    """The public three-field assistant contract."""


_PAGE_REFERENCE = re.compile(r"(?i)\b(?:этот|этого|этом|его|нему|для него|аналоги|альтернативы|остаток|наличие)\b")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, limit: int = Query(default=5, ge=1, le=20)):
    from app.main import assistant

    if request.attachment_ids:
        return ChatResponse(
            message="Обработка вложений по их ID пока недоступна. Отправьте запрос без вложений.",
            products=[], cart_proposal=None,
        )
    try:
        query = parse_query(request.message) if len(request.message) <= 2000 else None
    except ValueError:
        query = None
    current_id = request.page_context.current_product_id
    product_id = current_id if (
        current_id and query is not None and query.product_id is None and query.article is None
        and _PAGE_REFERENCE.search(request.message)
    ) else None
    try:
        assistant_request = AssistantRequest(
            session_id=request.session_id, message=request.message, product_id=product_id,
            city=request.page_context.city, limit=limit,
        )
    except ValueError:
        return ChatResponse(message="Уточните запрос и данные выбранного товара.", products=[], cart_proposal=None)
    response = await assistant.answer(assistant_request)
    return ChatResponse.model_validate(response.model_dump())
