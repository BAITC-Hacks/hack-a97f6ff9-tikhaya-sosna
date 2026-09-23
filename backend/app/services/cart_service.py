from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.repositories.cart_repository import CartActionRepository
from app.services.stock_service import StockService


class CartActionService:
    def __init__(self, repository: CartActionRepository) -> None:
        self.repository = repository

    async def propose(self, *, session_id: str, product_id: int, quantity: int, city: str | None, detail):
        available = StockService.available(detail, city)
        if quantity > available:
            raise ValueError(f"Requested quantity exceeds available stock ({available})")
        action = {
            "action_id": f"ca_{uuid4().hex}",
            "session_id": session_id,
            "product_id": product_id,
            "product_name": detail.name,
            "quantity": quantity,
            "available_quantity": available,
            "city": city,
            "status": "pending_confirmation",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        await self.repository.create(action)
        return action

    async def validate(self, action_id: str, session_id: str, stock: int):
        return await self.repository.validate(action_id, session_id, stock)
