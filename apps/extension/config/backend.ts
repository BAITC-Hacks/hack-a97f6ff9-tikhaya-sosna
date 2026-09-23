export interface BackendConfig {
  origin: string;
  endpoint: string;
  hostPermission: string;
}

/** Public build-time origin only. No endpoint paths or partner EKT hosts. */
export function resolveBackendConfig(raw: string | undefined): BackendConfig | null {
  if (!raw || /[\s\\*\u0000-\u001f\u007f]/u.test(raw) ||
    !/^https?:\/\/[^/?#]+\/?$/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.username || url.password || url.search || url.hash ||
      url.pathname !== '/' || hostname === 'ekt.kz' || hostname.endsWith('.ekt.kz') ||
      hostname.startsWith('[') || hostname.endsWith('.') ||
      !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/u.test(hostname)) return null;
    if (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1'))) return null;
    const origin = url.origin;
    // Chromium match patterns do not encode ports; the fetch URL still fixes the port.
    return { origin, endpoint: `${origin}/api/v1/chat`, hostPermission: `${url.protocol}//${hostname}/*` };
  } catch { return null; }
}

export function backendHostPermissions(config: BackendConfig | null): string[] {
  return config ? [config.hostPermission] : [];
}
