import { useState } from 'react';
import { safeProductUrl, safeUploadUrl, type ProductCardData } from '../../contracts/product';

const priceFormat = new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT' });
const quantityFormat = new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 20 });

export default function ProductCard({ product }: { product: ProductCardData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = safeUploadUrl(product.image_url);
  const link = safeProductUrl(product.product_url);
  const certificate = safeUploadUrl(product.certificate_url);
  return (
    <article className="ekt-ai-product">
      {image && !imageFailed && <img src={image} alt={product.name} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)} />}
      <h4>{product.name}</h4>
      {product.article !== null && <p>Артикул: {product.article}</p>}
      <p>{product.price === null ? 'Цена не указана' : priceFormat.format(product.price)}</p>
      <p>Наличие: {product.available_quantity === null ? 'не указано' : quantityFormat.format(product.available_quantity)}</p>
      <p>Склад: {product.stock_location ?? 'не указан'}</p>
      {product.stock_checked_at && <p>Наличие проверено: {product.stock_checked_at}</p>}
      {product.stores.length > 0 && <ul>{product.stores.map((store) =>
        <li key={store.id}>{store.name}: {store.quantity === null ? 'не указано' : quantityFormat.format(store.quantity)}</li>)}</ul>}
      {link && <a href={link} target="_blank" rel="noopener noreferrer">Открыть товар</a>}
      {certificate && <a href={certificate} target="_blank" rel="noopener noreferrer">Сертификат</a>}
    </article>
  );
}
