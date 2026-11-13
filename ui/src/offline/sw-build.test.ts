import { describe, expect, it } from 'vitest';
import { precacheList, versionOf } from './sw-build.ts';

describe('precacheList', () => {
  it('keeps the page, its built files, icons and manifest; never maps or the worker', () => {
    const list = precacheList(
      [
        'index.html',
        'assets/index-abc.js',
        'assets/index-abc.js.map',
        'assets/index-d.css',
        'assets/f.woff',
        'sw.js',
      ],
      ['icons/otea-192.png', 'manifest.webmanifest', 'otea-idle.svg'],
    );

    expect(list).toEqual([
      '/',
      '/assets/index-abc.js',
      '/assets/index-d.css',
      '/icons/otea-192.png',
      '/manifest.webmanifest',
      '/otea-idle.svg',
    ]);
  });
});

describe('versionOf', () => {
  it('changes with any file and stays with the same files', () => {
    const a = versionOf(['/', '/assets/index-abc.js']);

    expect(versionOf(['/', '/assets/index-abc.js'])).toBe(a);
    expect(versionOf(['/', '/assets/index-abd.js'])).not.toBe(a);
    expect(versionOf(['/', '/assets/index-abc.js'], 'worker code')).not.toBe(a);
  });
});
