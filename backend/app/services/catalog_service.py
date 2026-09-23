from app.integrations.ekt.schemas import ProductDetail
from app.repositories.product_repository import ProductRepository


class CatalogService:
    def __init__(self, repository: ProductRepository) -> None:
        self.repository = repository

    def search(self, query: str):
        return self.repository.search(query)

    def get_product(self, product_id: int):
        return self.repository.get(product_id)

    def get_detail(self, product_id: int) -> ProductDetail | None:
        return self.repository.get_detail(product_id)

    def list_products(self, page: int = 1, per_page: int = 20):
        products = self.repository.all()
        start = (page - 1) * per_page
        return products[start : start + per_page], len(products)

    def remember_detail(self, detail: ProductDetail) -> None:
        from app.integrations.ekt.mapper import detail_to_list_item

        self.repository.upsert_detail(detail)
        self.repository.upsert(detail_to_list_item(detail))
