// Pairing a phone over the LAN: the pieces of the pairing screen and the LAN panel that need no DOM.

// The QR code carries the pairing code in the fragment: `/pair#code=7Q4M-2K9X`.
export function codeFromHash(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return (params.get('code') ?? '').trim();
}

// A name to start the device field with, from what the browser says it is: "Android · Chrome".
export function deviceNameFrom(userAgent: string): string {
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'Phone';
  const browser = /EdgA?\//.test(userAgent)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : '';
  return browser === '' ? system : `${system} · ${browser}`;
}

// What is left of a code, as m:ss; 0:00 once it ran out.
export function timeLeft(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// The QR modules as one SVG path, a unit square per dark module.
export function qrPath(cells: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  cells.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return parts.join('');
}

// The host a device opens, without the scheme: "192.168.1.24:4485".
export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

// The host without its port: "lartweib.local" from "lartweib.local:4485".
export function hostnameOf(host: string): string {
  return host.replace(/:\d+$/, '');
}

export function isLocalName(hostname: string): boolean {
  return hostname.endsWith('.local');
}

// The pairing link by IP, for a phone that cannot resolve the .local name the QR code carries.
export function ipFallback(urls: readonly string[], pairingUrl: string): string | undefined {
  const byIp = urls.find((url) => /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(url));
  if (!byIp) return undefined;
  const { pathname, hash } = new URL(pairingUrl);
  return `${byIp}${pathname}${hash}`;
}
