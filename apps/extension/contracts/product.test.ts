import { expect, test } from 'vitest';
import legacyFixture from '../tests/fixtures/backend-chat-legacy-success.json';
import { legacyBackendProductSchema, normalizeLegacyProduct, productCardSchema } from './product';

test('legacy Decimal price and nullable list fields normalize into the strict card', () => {
  const product = legacyBackendProductSchema.parse(legacyFixture.products[0]);
  const card = normalizeLegacyProduct(product);
  expect(productCardSchema.parse(card)).toEqual(card);
  expect(card).toMatchObject({ price: 1250.5, currency: 'KZT', available_quantity: null,
    certificate_url: null, stock_location: null, stock_checked_at: null, stores: [] });
  expect(legacyBackendProductSchema.parse({ ...legacyFixture.products[0], price: 0 }).price).toBe(0);
  expect(legacyBackendProductSchema.parse({ ...legacyFixture.products[0], price: '1E-3' }).price).toBe(0.001);
});

test('legacy product rejects invalid known values and does not treat list metadata as stock', () => {
  const first = legacyFixture.products[0];
  for (const price of [-1, '-0.01', 'NaN', '1e999', ' ', {}, Number.POSITIVE_INFINITY]) {
    expect(legacyBackendProductSchema.safeParse({ ...first, price }).success).toBe(false);
  }
  const product = legacyBackendProductSchema.parse({ ...first, offers: [{ quantity: 99 }],
    properties: { available_quantity: 99 }, image: 'https://other.invalid/upload/p.png',
    url: 'https://ekt.kz/private/product', url_api_detail: 'https://ekt.kz/catalog/unused' });
  expect(normalizeLegacyProduct(product)).toMatchObject({ available_quantity: null,
    image_url: null, product_url: null, stores: [] });
});
