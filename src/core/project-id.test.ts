import { describe, expect, it } from 'vitest';
import { projectId, slugify } from './project-id.ts';

describe('slugify', () => {
  it.each([
    ['otea', 'otea'],
    ['My Product', 'my-product'],
    ['  --Café_Ñandú 2--  ', 'cafe-nandu-2'],
    ['a'.repeat(40), 'a'.repeat(32)],
    ['', 'project'],
    ['日本', 'project'],
  ])('turns %j into %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('projectId', () => {
  it('appends one base32 char per random byte', () => {
    expect(projectId('My App', new Uint8Array([0, 1, 25, 26, 31, 32]))).toBe('my-app-abz27a');
  });

  it('matches the id pattern for any bytes', () => {
    const random = crypto.getRandomValues(new Uint8Array(6));

    expect(projectId('otea', random)).toMatch(/^otea-[a-z2-7]{6}$/);
  });
});
