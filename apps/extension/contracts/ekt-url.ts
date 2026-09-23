/** Shared URL policy for EKT page and sender validation. */
export function parseEktPageUrl(value: string): URL | null {
  if (value.trim() !== value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname;
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== '' ||
      (hostname !== 'ekt.kz' && !hostname.endsWith('.ekt.kz'))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isCanonicalEktOrigin(value: string): boolean {
  const url = parseEktPageUrl(value);
  return url !== null && value === url.origin;
}
