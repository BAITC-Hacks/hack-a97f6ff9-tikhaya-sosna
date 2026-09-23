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
