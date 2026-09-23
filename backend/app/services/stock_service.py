from app.integrations.ekt.schemas import ProductDetail


class StockService:
    @staticmethod
    def available(detail: ProductDetail, city: str | None = None) -> int:
        if city:
            return detail.stock_in_store(city)
        return max(detail.quantity, 0)
