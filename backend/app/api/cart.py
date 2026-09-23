from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.integrations.ekt.client import EktApiError
from app.services.stock_service import StockService

router = APIRouter(prefix="/api/v1/cart-actions", tags=["cart actions"])


class CartProposalRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100_000)
    city: str | None = Field(default=None, max_length=120)


class CartValidationRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)


@router.post("")
async def create_cart_proposal(request: CartProposalRequest):
    from app.main import cart_actions, catalog, database, ekt_client

    try:
        detail = await ekt_client.get_product_detail(request.product_id) if ekt_client.configured else catalog.get_detail(request.product_id)
    except EktApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if detail is None:
        raise HTTPException(status_code=404, detail="Product detail not found")
    catalog.remember_detail(detail)
    await database.save_product(catalog.get_product(detail.id), detail)
    available = StockService.available(detail, request.city)
    if available <= 0:
        raise HTTPException(status_code=409, detail="Product is unavailable in the selected location")
    try:
        return await cart_actions.propose(
            session_id=request.session_id,
            product_id=request.product_id,
            quantity=request.quantity,
            city=request.city,
            detail=detail,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{action_id}/validate")
async def validate_cart_proposal(action_id: str, request: CartValidationRequest):
    from app.main import cart_actions, catalog, database, ekt_client

    action = cart_actions.repository._actions.get(action_id)
    if action is None:
        action = await database.get_cart_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Cart action not found")
    if action.get("session_id") != request.session_id:
        raise HTTPException(status_code=403, detail="Cart action belongs to another session")
    try:
        detail = await ekt_client.get_product_detail(action["product_id"]) if ekt_client.configured else catalog.get_detail(action["product_id"]) or await database.find_detail(action["product_id"])
    except EktApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if detail is None:
        raise HTTPException(status_code=404, detail="Product detail not found")
    if ekt_client.configured:
        catalog.remember_detail(detail)
        await database.save_product(catalog.get_product(detail.id), detail)
    stock = StockService.available(detail, action.get("city"))
    try:
        validated = await cart_actions.validate(action_id, request.session_id, stock)
    except ValueError as exc:
        message = str(exc)
        status = 404 if "not found" in message.lower() else 409
        raise HTTPException(status_code=status, detail=message) from exc
    return {
        "action_id": validated["action_id"],
        "product_id": validated["product_id"],
        "quantity": validated["quantity"],
        "status": "validated",
    }


@router.post("/{action_id}/cancel")
async def cancel_cart_proposal(action_id: str, request: CartValidationRequest):
    from app.main import cart_actions, database

    action = cart_actions.repository._actions.get(action_id) or await database.get_cart_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Cart action not found")
    if action.get("session_id") != request.session_id:
        raise HTTPException(status_code=403, detail="Cart action belongs to another session")
    if action.get("status") != "pending_confirmation":
        raise HTTPException(status_code=409, detail="Cart action has already been used")
    action["status"] = "cancelled"
    await database.update_cart_action(action_id, "cancelled")
    return {"action_id": action_id, "status": "cancelled"}
