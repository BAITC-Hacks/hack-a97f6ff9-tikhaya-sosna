import { afterEach, describe, expect, test, vi } from 'vitest';
import { pageContextSchema } from '../contracts';
import { buildPageContext, readPageContext } from './page-context';

const originalLang = document.documentElement.lang;
afterEach(() => { document.documentElement.lang = originalLang; vi.unstubAllGlobals(); });

describe('sanitized EKT page context', () => {
  test('handles root, www, regional and nested host hints', () => {
    for (const [href, region] of [
      ['https://ekt.kz/', null], ['https://www.ekt.kz/', null],
      ['https://nursultan.ekt.kz/', 'nursultan'],
      ['https://shop.nursultan.ekt.kz/', null],
    ] as const) {
      const context = buildPageContext({ href, htmlLang: 'ru-KZ' });
      expect(context).toEqual({ url: href, origin: new URL(href).origin,
        region, locale: 'ru', current_product_id: null });
      expect(pageContextSchema.safeParse(context).success).toBe(true);
    }
  });

  test('normalizes supported language hints and falls back to ru', () => {
    for (const [htmlLang, locale] of [
      ['ru-KZ', 'ru'], ['kk-KZ', 'kk'], ['en-US', 'en'], ['', 'ru'],
      ['de-DE', 'ru'], ['not_a_tag', 'ru'],
    ] as const) expect(buildPageContext({ href: 'https://ekt.kz/', htmlLang })?.locale).toBe(locale);
  });

  test('keeps only catalog paths without query or hash; all private paths become root', () => {
    const origin = 'https://nursultan.ekt.kz';
    for (const [path, outward] of [
      ['/catalog?x=1#h', '/catalog'],
      ['/catalog/example/?utm_source=demo#details', '/catalog/example/'],
      ['/catalog/123?private=1', '/catalog/123'],
      ['/Catalog/123?x=1', '/'],
      ['/catalogue/123?x=1', '/'],
      ['/personal/order/123/?token=synthetic#payment', '/'],
      ['/checkout/123?x=1', '/'], ['/login?x=1', '/'], ['/api/cart?x=1', '/'],
    ]) {
      const context = buildPageContext({ href: `${origin}${path}`, htmlLang: 'ru' });
      expect(context?.url).toBe(`${origin}${outward}`);
      expect(context?.current_product_id).toBeNull();
      expect(pageContextSchema.safeParse(context).success).toBe(true);
    }
  });

  test('falls back to root when an allowed catalog URL exceeds the schema limit', () => {
    const longPath = 'x'.repeat(2100);
    expect(buildPageContext({ href: `https://ekt.kz/catalog/${longPath}?secret=demo`, htmlLang: 'ru' })?.url)
      .toBe('https://ekt.kz/');
  });

  test('rejects untrusted URLs before any sanitization', () => {
    for (const href of [
      'https://evil-ekt.kz/personal/?secret=1', 'https://ekt.kz.attacker.invalid/',
      'http://ekt.kz/', 'https://user:pass@ekt.kz/', 'https://ekt.kz:8443/',
      'javascript:alert(1)', 'not a url', ' https://ekt.kz/',
    ]) expect(buildPageContext({ href, htmlLang: 'ru' })).toBeNull();
  });

  test('thin reader uses current DOM and location inputs on each call', () => {
    document.documentElement.lang = 'kk-KZ';
    vi.stubGlobal('window', { location: { href: 'https://ekt.kz/catalog/123?token=synthetic' } });
    expect(readPageContext()).toEqual({ url: 'https://ekt.kz/catalog/123',
      origin: 'https://ekt.kz', region: null, locale: 'kk', current_product_id: null });
    document.documentElement.lang = 'en-US';
    vi.stubGlobal('window', { location: { href: 'https://ekt.kz/personal/order/123' } });
    expect(readPageContext()).toEqual({ url: 'https://ekt.kz/',
      origin: 'https://ekt.kz', region: null, locale: 'en', current_product_id: null });
    vi.stubGlobal('window', { location: { href: 'https://evil-ekt.kz/' } });
    expect(readPageContext()).toBeNull();
  });
});
