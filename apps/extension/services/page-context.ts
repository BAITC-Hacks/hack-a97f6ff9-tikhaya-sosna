import { pageContextSchema, parseEktPageUrl, type PageContext } from '../contracts';

export interface PageSnapshot {
  href: string;
  htmlLang: string;
}

function localeFromHint(hint: string): 'ru' | 'kk' | 'en' {
  try {
    const canonical = Intl.getCanonicalLocales(hint)[0];
    const primary = canonical?.split('-')[0]?.toLowerCase();
    return primary === 'ru' || primary === 'kk' || primary === 'en' ? primary : 'ru';
  } catch {
    return 'ru';
  }
}

function regionFromHostname(hostname: string): string | null {
  if (hostname === 'ekt.kz' || hostname === 'www.ekt.kz') return null;
  const suffix = '.ekt.kz';
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(label) ? label : null;
}

export function buildPageContext(snapshot: PageSnapshot): PageContext | null {
  if (typeof snapshot.href !== 'string') return null;
  const parsed = parseEktPageUrl(snapshot.href);
  if (!parsed) return null;

  const root = new URL('/', parsed.origin);
  const catalog = parsed.pathname === '/catalog' || parsed.pathname.startsWith('/catalog/');
  const outward = catalog ? new URL(parsed.href) : root;
  outward.search = '';
  outward.hash = '';
  const url = outward.href.length <= 2048 ? outward.href : root.href;
  const checked = pageContextSchema.safeParse({
    url,
    origin: parsed.origin,
    region: regionFromHostname(parsed.hostname),
    locale: localeFromHint(snapshot.htmlLang),
    current_product_id: null,
  });
  return checked.success ? checked.data : null;
}

export function readPageContext(): PageContext | null {
  try {
    return buildPageContext({ href: window.location.href, htmlLang: document.documentElement.lang });
  } catch {
    return null;
  }
}
