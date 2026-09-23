from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any


class CartActionRepository:
    def __init__(self) -> None:
        self._actions: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def create(self, action: dict[str, Any]) -> None:
        from app.main import database

        async with self._lock:
            self._actions[action["action_id"]] = action
        await database.create_cart_action(action)

    async def validate(self, action_id: str, session_id: str, stock: int) -> dict[str, Any]:
        from app.main import database

        async with self._lock:
            action = self._actions.get(action_id)
            if action is None:
                action = await database.get_cart_action(action_id)
            if action is None:
                raise ValueError("Cart action not found")
            if action["session_id"] != session_id:
                raise ValueError("Cart action does not belong to this session")
            if action["status"] != "pending_confirmation":
                raise ValueError("Cart action has already been used")
            if action["expires_at"] <= datetime.now(timezone.utc):
                action["status"] = "expired"
                await database.update_cart_action(action_id, "expired")
                raise ValueError("Cart action has expired")
            if action["quantity"] > stock:
                action["status"] = "failed"
                await database.update_cart_action(action_id, "failed")
                raise ValueError("Current stock is lower than the requested quantity")
            if database.pool is not None:
                updated = await database.consume_cart_action(action_id, stock)
                if updated is None:
                    action["status"] = "used"
                    raise ValueError("Cart action has expired or has already been used")
                return dict(updated)
            action["status"] = "validated"
            return dict(action)
