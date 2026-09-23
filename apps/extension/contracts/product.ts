import { z } from 'zod';
import { parseEktPageUrl } from './ekt-url';

const nonblank = (max: number) => z.string().refine((text) => text.length <= max && text.trim().length > 0);
const quantity = z.number().finite().nonnegative().nullable();
const positiveId = z.number().int().positive().refine(Number.isSafeInteger);
const urlField = z.string().refine((text) => text.length <= 2048).nullable();
const legacyPrice = z.union([
  z.number().finite().nonnegative(),
  z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u)
    .transform(Number).pipe(z.number().finite().nonnegative()),
]).nullable();

export function safeProductUrl(value: string | null): string | null {
  if (value === null) return null;
  const url = parseEktPageUrl(value);
  return url && (url.pathname === '/catalog' || url.pathname.startsWith('/catalog/')) ? value : null;
}

export function safeUploadUrl(value: string | null): string | null {
  if (value === null) return null;
  const url = parseEktPageUrl(value);
  return url && url.pathname.startsWith('/upload/') ? value : null;
}

export const backendProductSchema = z.object({
  id: positiveId,
  article: z.string().refine((text) => text.length <= 128).nullable(),
  name: nonblank(512),
  price: quantity,
  currency: z.literal('KZT'),
  available_quantity: quantity,
  image_url: urlField,
  product_url: urlField,
  certificate_url: urlField.optional(),
  stock_location: nonblank(120).nullable().optional(),
  stock_checked_at: z.iso.datetime({ offset: true }).nullable().optional(),
  stores: z.array(z.object({ id: positiveId, name: nonblank(120), quantity })).max(100).optional(),
});

// FastAPI serializes ProductListItem.price (Decimal) as a JSON string.
export const legacyBackendProductSchema = z.object({
  id: positiveId,
  name: nonblank(512),
  article: z.string().max(128).nullable(),
  price: legacyPrice,
  image: urlField,
  url: urlField,
  url_api_detail: urlField,
  offers: z.array(z.unknown()),
  supplier_article: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const productCardSchema = z.strictObject({
  id: positiveId,
  article: z.string().refine((text) => text.length <= 128).nullable(),
  name: nonblank(512),
  price: quantity,
  currency: z.literal('KZT'),
  available_quantity: quantity,
  image_url: urlField.refine((url) => safeUploadUrl(url) === url),
  product_url: urlField.refine((url) => safeProductUrl(url) === url),
  certificate_url: urlField.refine((url) => safeUploadUrl(url) === url),
  stock_location: nonblank(120).nullable(),
  stock_checked_at: z.iso.datetime({ offset: true }).nullable(),
  stores: z.array(z.strictObject({ id: positiveId, name: nonblank(120), quantity })).max(100),
});

export type ProductCardData = z.infer<typeof productCardSchema>;

export function normalizeProduct(product: z.infer<typeof backendProductSchema>): ProductCardData {
  return {
    id: product.id, article: product.article, name: product.name, price: product.price,
    currency: product.currency, available_quantity: product.available_quantity,
    image_url: safeUploadUrl(product.image_url), product_url: safeProductUrl(product.product_url),
    certificate_url: safeUploadUrl(product.certificate_url ?? null),
    stock_location: product.stock_location ?? null, stock_checked_at: product.stock_checked_at ?? null,
    stores: product.stores ?? [],
  };
}

export function normalizeLegacyProduct(product: z.infer<typeof legacyBackendProductSchema>): ProductCardData {
  return {
    id: product.id, article: product.article, name: product.name, price: product.price,
    currency: 'KZT', available_quantity: null,
    image_url: safeUploadUrl(product.image), product_url: safeProductUrl(product.url),
    certificate_url: null, stock_location: null, stock_checked_at: null, stores: [],
  };
}
