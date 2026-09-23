"""HTTP boundary for validated assistant responses."""

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.assistant.response_models import AssistantRequest, StructuredResponse


router = APIRouter(prefix="/api/v1/chat", tags=["chat"])
_LOGGER = logging.getLogger(__name__)


@router.post("", response_model=StructuredResponse)
def chat(payload: AssistantRequest, request: Request):
    try:
        result = request.app.state.assistant.answer(payload)
        data = result.model_dump() if isinstance(result, BaseModel) else result
        return StructuredResponse.model_validate(data)
    except Exception as exc:
        _LOGGER.warning("Assistant API failed: %s", type(exc).__name__)
        error = StructuredResponse(message="Не удалось обработать запрос. Попробуйте ещё раз.", products=[], cart_proposal=None)
        return JSONResponse(status_code=500, content=error.model_dump(mode="json"))
