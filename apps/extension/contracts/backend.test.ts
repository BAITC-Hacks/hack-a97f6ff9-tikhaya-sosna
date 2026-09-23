import { expect, test } from 'vitest';
import fixture from '../tests/fixtures/backend-chat-success.json';
import legacyFixture from '../tests/fixtures/backend-chat-legacy-success.json';
import { backendChatResponseSchema, legacyBackendChatResponseSchema, normalizeBackendReply } from './backend';
import { safeProductUrl, safeUploadUrl } from './product';

test('normalizes synthetic response, strips unknown fields and discards opaque proposal', () => {
  const reply = normalizeBackendReply({ ...fixture, extra: 'discard', cart_proposal: { private: 'discard' },
    products: [{ ...fixture.products[0], extra: 'discard' }] });
  expect(reply).toMatchObject({ request_id: fixture.request_id, cart_proposal_received: true,
    products: [{ id: 42, price: 0, available_quantity: 1.5 }] });
  expect(JSON.stringify(reply)).not.toContain('private');
  expect(JSON.stringify(reply)).not.toContain('extra');
  expect(normalizeBackendReply({ ...fixture, products: [] })?.products).toEqual([]);
});

test('known malformed facts fail, unsafe string links become null', () => {
  for (const patch of [{ price: '0' }, { price: -1 }, { currency: 'USD' },
    { id: 0 }, { available_quantity: -0.1 }, { stores: [{ id: 1, name: '', quantity: 0 }] },
    { image_url: 2 }]) {
    expect(normalizeBackendReply({ ...fixture, products: [{ ...fixture.products[0], ...patch }] })).toBeNull();
  }
  const reply = normalizeBackendReply({ ...fixture, products: [{ ...fixture.products[0],
    image_url: 'https://evil.invalid/upload/a.jpg', product_url: 'javascript:alert(1)',
    certificate_url: 'https://ekt.kz/private/file.pdf' }] });
  expect(reply?.products[0]).toMatchObject({ image_url: null, product_url: null, certificate_url: null });
  expect(safeProductUrl('https://ekt.kz/catalog/a/?q=1')).toBe('https://ekt.kz/catalog/a/?q=1');
  expect(safeUploadUrl('https://ekt.kz/upload/a.jpg')).toBe('https://ekt.kz/upload/a.jpg');
  expect(safeUploadUrl('https://ekt.kz/catalog/a')).toBeNull();
  expect(backendChatResponseSchema.safeParse({ ...fixture, cart_proposal: [] }).success).toBe(false);
});

test('canonical reply retains backend ID, stock and stores even when a fallback is supplied', () => {
  const reply = normalizeBackendReply(fixture, { fallbackRequestId: 'outbound_1' });
  expect(reply?.request_id).toBe(fixture.request_id);
  expect(reply?.products[0]).toEqual({
    id: 42, article: fixture.products[0]?.article, name: fixture.products[0]?.name,
    price: 0, currency: 'KZT', available_quantity: 1.5,
    image_url: fixture.products[0]?.image_url, product_url: fixture.products[0]?.product_url,
    certificate_url: fixture.products[0]?.certificate_url,
    stock_location: fixture.products[0]?.stock_location,
    stock_checked_at: fixture.products[0]?.stock_checked_at, stores: fixture.products[0]?.stores,
  });
  expect(normalizeBackendReply({ ...fixture, request_id: '' }, { fallbackRequestId: 'outbound_1' })).toBeNull();
});

test('legacy reply uses only outbound ID and maps list facts without stock claims', () => {
  expect(legacyBackendChatResponseSchema.safeParse(legacyFixture).success).toBe(true);
  const reply = normalizeBackendReply(legacyFixture, { fallbackRequestId: 'outbound_1' });
  expect(reply).toEqual({ request_id: 'outbound_1', message: legacyFixture.message,
    cart_proposal_received: false, products: [
      { id: 42, article: 'FIX-42', name: 'Fixture cable', price: 1250.5,
        currency: 'KZT', available_quantity: null,
        image_url: 'https://ekt.kz/upload/fixture.jpg', product_url: 'https://ekt.kz/catalog/fixture/',
        certificate_url: null, stock_location: null, stock_checked_at: null, stores: [] },
      { id: 43, article: null, name: 'Fixture connector', price: null,
        currency: 'KZT', available_quantity: null, image_url: null, product_url: null,
        certificate_url: null, stock_location: null, stock_checked_at: null, stores: [] },
    ] });
  expect(normalizeBackendReply(legacyFixture)).toBeNull();
  expect(normalizeBackendReply(legacyFixture, { fallbackRequestId: '' })).toBeNull();
});

test('legacy rejects malformed facts and proposal shapes; it ignores opaque list metadata', () => {
  const first = legacyFixture.products[0];
  for (const patch of [
    { id: 0 }, { id: Number.MAX_SAFE_INTEGER + 1 },
    { price: -1 }, { price: '-1' }, { price: 'Infinity' }, { price: '1e999' },
    { name: ' ' }, { name: 'x'.repeat(513) }, { article: 7 }, { image: 7 },
    { offers: {} }, { properties: [] },
  ]) {
    expect(normalizeBackendReply({ ...legacyFixture, products: [{ ...first, ...patch }] },
      { fallbackRequestId: 'outbound_1' })).toBeNull();
  }
  for (const products of [null, {}, [null]]) {
    expect(normalizeBackendReply({ ...legacyFixture, products }, { fallbackRequestId: 'outbound_1' })).toBeNull();
  }
  for (const cart_proposal of [[], 'yes', 1]) {
    expect(normalizeBackendReply({ ...legacyFixture, cart_proposal },
      { fallbackRequestId: 'outbound_1' })).toBeNull();
  }
  expect(normalizeBackendReply({ message: legacyFixture.message }, { fallbackRequestId: 'outbound_1' })).toBeNull();
  expect(normalizeBackendReply({ ...legacyFixture, cart_proposal: { opaque: true } },
    { fallbackRequestId: 'outbound_1' })?.cart_proposal_received).toBe(true);
  const safe = normalizeBackendReply({ ...legacyFixture, products: [{ ...first,
    image: 'https://evil.invalid/upload/a.jpg', url: 'javascript:alert(1)',
    url_api_detail: 'https://ekt.kz/catalog/not-a-product/',
    offers: [{ quantity: 100 }], properties: { quantity: 100 }, extra: 'discard',
  }] }, { fallbackRequestId: 'outbound_1' });
  expect(safe?.products[0]).toMatchObject({ image_url: null, product_url: null,
    available_quantity: null, stores: [] });
  expect(JSON.stringify(safe)).not.toContain('extra');
});
