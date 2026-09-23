from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
from pydantic import ValidationError

from app.integrations.ekt.schemas import ProductDetail, ProductListResponse


class EktApiError(RuntimeError):
    """Safe-to-show error raised for EKT integration failures."""


class EktApiClient:
    def __init__(self) -> None:
        self._username = os.getenv("EKT_API_USERNAME", "")
        self._password = os.getenv("EKT_API_PASSWORD", "")
        self._base_url = os.getenv("EKT_API_BASE_URL", "https://ekt.kz/api").rstrip("/") + "/"
        self._timeout = float(os.getenv("EKT_REQUEST_TIMEOUT_SECONDS", "8"))
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if not self._username or not self._password:
            return
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            auth=httpx.BasicAuth(self._username, self._password),
            timeout=httpx.Timeout(self._timeout, connect=3.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            headers={"Accept": "application/json", "User-Agent": "TikhayaSosnaAssistant/1.0"},
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def configured(self) -> bool:
        return self._client is not None

    async def get_products(self, page: int = 1) -> ProductListResponse:
        if page < 1:
            raise ValueError("page must be positive")
        data = await self._request_json("products", params={"page": page})
        try:
            return ProductListResponse.model_validate(data)
        except ValidationError as exc:
            raise EktApiError("EKT returned an unexpected product list") from exc

    async def get_product_detail(self, product_id: int) -> ProductDetail:
        if product_id <= 0:
            raise ValueError("product_id must be positive")
        data = await self._request_json("products/detail", params={"id": product_id})
        try:
            return ProductDetail.model_validate(data)
        except ValidationError as exc:
            raise EktApiError(f"EKT returned an unexpected detail for product {product_id}") from exc

    async def _request_json(self, path: str, *, params: dict[str, Any]) -> dict[str, Any]:
        if self._client is None:
            raise EktApiError("EKT credentials are not configured; set EKT_API_USERNAME and EKT_API_PASSWORD")
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self._client.get(path, params=params)
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise EktApiError("EKT returned a non-object JSON response")
                return payload
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status < 500 and status != 429:
                    raise EktApiError(f"EKT returned HTTP {status}") from exc
                last_error = exc
            except httpx.TimeoutException as exc:
                last_error = exc
            except httpx.RequestError as exc:
                last_error = exc
            except ValueError as exc:
                raise EktApiError("EKT returned invalid JSON") from exc
            if attempt < 2:
                await asyncio.sleep(0.2 * (2**attempt))
        if isinstance(last_error, httpx.HTTPStatusError):
            raise EktApiError(f"EKT returned HTTP {last_error.response.status_code}") from last_error
        raise EktApiError("EKT request failed after retries") from last_error
