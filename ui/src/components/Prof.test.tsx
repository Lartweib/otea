import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { Prof } from './Prof.tsx';

afterEach(() => setLanguage('en'));

describe('Prof', () => {
  it('writes the model and the effort as declared', () => {
    expect(renderToStaticMarkup(<Prof profile={{ model: 'gpt-5', effort: 'high' }} />)).toBe(
      '<span class="prof">gpt-5 <i>·</i> high</span>',
    );
  });

  it('says plainly a value the agent could not read', () => {
    setLanguage('es');
    expect(renderToStaticMarkup(<Prof profile={{ model: 'unknown', effort: 'high' }} />)).toBe(
      '<span class="prof">sin declarar <i>·</i> high</span>',
    );
  });
});
