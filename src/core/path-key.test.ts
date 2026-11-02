import { describe, expect, it } from 'vitest';
import { longestContaining, pathKey } from './path-key.ts';

describe('pathKey', () => {
  it('uses forward slashes and lowercases on Windows', () => {
    expect(pathKey('C:\\Code\\My App', 'win32')).toBe('c:/code/my app');
  });

  it('lowercases on macOS', () => {
    expect(pathKey('/Users/Ana/App', 'darwin')).toBe('/users/ana/app');
  });

  it('keeps the case on Linux', () => {
    expect(pathKey('/home/Ana/App', 'linux')).toBe('/home/Ana/App');
  });
});

describe('longestContaining', () => {
  const entries = [
    { pathKey: '/code/product', id: 'product' },
    { pathKey: '/code/product/api', id: 'api' },
    { pathKey: '/code/other', id: 'other' },
  ];

  it.each([
    ['/code/product', 'product'],
    ['/code/product/web/src', 'product'],
    ['/code/product/api', 'api'],
    ['/code/product/api/src', 'api'],
  ])('finds %s in %s', (key, id) => {
    expect(longestContaining(entries, key)?.id).toBe(id);
  });

  it('does not take a sibling with the same prefix for a parent', () => {
    expect(longestContaining(entries, '/code/product-two')).toBeUndefined();
    expect(longestContaining(entries, '/code')).toBeUndefined();
  });

  it('handles a key at the root of a drive', () => {
    expect(longestContaining([{ pathKey: 'c:/' }], 'c:/code')).toEqual({ pathKey: 'c:/' });
    expect(longestContaining([{ pathKey: '/' }], '/code')).toEqual({ pathKey: '/' });
  });
});
