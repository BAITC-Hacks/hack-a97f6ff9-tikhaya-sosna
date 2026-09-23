from app.integrations.ekt.schemas import ProductDetail, ProductListItem


def detail_to_list_item(detail: ProductDetail) -> ProductListItem:
    properties = detail.properties
    barcode = properties.get("CML2_BAR_CODE")
    supplier_article = properties.get("ARTIKULPOSTAVSHCHIKA")
    return ProductListItem(
        id=detail.id,
        name=detail.name,
        article=detail.article,
        price=detail.price,
        image=detail.image,
        url=detail.url,
        offers=detail.offers,
        supplier_article=str(supplier_article) if supplier_article is not None else None,
        barcode=str(barcode) if barcode is not None else None,
        properties=properties,
    )


def enrich_list_item(item: ProductListItem, detail: ProductDetail) -> ProductListItem:
    mapped = detail_to_list_item(detail)
    return item.model_copy(update={
        "supplier_article": mapped.supplier_article,
        "barcode": mapped.barcode,
        "properties": mapped.properties,
    })
