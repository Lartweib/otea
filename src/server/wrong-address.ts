import type { Context } from 'hono';

// A page opened at an address this server does not answer at: the Android emulator's 10.0.2.2, a
// name the router gave the computer, an old IP. The API keeps its JSON refusal (forbidden_host);
// a person in a browser reads what to open instead (DR2-11). The page says nothing of the project
// and never repeats the address it was asked for.

const WORDS = {
  en: {
    title: 'Otea does not open at this address',
    text: 'This address does not reach Otea. On your phone, scan the pairing code your computer shows in Settings › Phone, or open the address written under it.',
  },
  es: {
    title: 'Otea no abre en esta dirección',
    text: 'Esta dirección no llega a Otea. En el teléfono, escanea el código de emparejamiento que muestra tu equipo en Configuración › Teléfono, o abre la dirección que aparece debajo.',
  },
} as const;

// Whether the refusal goes to a person's browser: a page asked for, outside the API.
export function wantsPage(c: Context): boolean {
  if (c.req.method !== 'GET' || c.req.path.startsWith('/api/')) return false;
  return (c.req.header('accept') ?? '').includes('text/html');
}

export function wrongAddressPage(acceptLanguage: string | undefined): string {
  const lang = /^\s*es\b/i.test(acceptLanguage ?? '') ? 'es' : 'en';
  const { title, text } = WORDS[lang];
  return `<!doctype html>
<html lang="${lang}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 20px}h1{font-size:1.4rem;font-weight:600}</style>
<h1>${title}</h1>
<p>${text}</p>
</html>
`;
}
