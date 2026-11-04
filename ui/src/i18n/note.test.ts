import { describe, expect, it } from 'vitest';
import { firstRunNote } from './i18n.ts';

describe('firstRunNote', () => {
  it('is due once the browser picked a language other than English, with the tag it asked for', () => {
    expect(firstRunNote({ preferred: ['es-AR', 'en'], chosen: 'es' })).toEqual({ tag: 'es-AR' });
  });

  it('names the tag the browser asked for in the language on screen', () => {
    expect(firstRunNote({ preferred: ['fr', 'es', 'en'], chosen: 'es' })).toEqual({ tag: 'es' });
  });

  it.each([
    ['English, which needs no note', { preferred: ['en-US'], chosen: 'en' }],
    ['a language asked for in the address', { asked: 'es', preferred: ['es-AR'], chosen: 'es' }],
    ['a language chosen before', { stored: 'es', preferred: ['es-AR'], chosen: 'es' }],
    ['a note seen before in this browser', { seen: true, preferred: ['es-AR'], chosen: 'es' }],
  ] as const)('is not due for %s', (_, start) => {
    expect(firstRunNote(start)).toBeUndefined();
  });
});
