import { expect, test } from 'vitest';
import fixture from '../tests/fixtures/backend-chat-success.json';
import { backendChatResponseSchema, normalizeBackendReply } from './backend';
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
