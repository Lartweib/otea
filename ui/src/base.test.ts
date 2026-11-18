import { describe, expect, it } from 'vitest';
import { apiUrl, projectIdOf, projectPage } from './base.ts';

describe('the project a page is on', () => {
  it('reads it from the page path', () => {
    expect(projectIdOf('/p/web-k3x7qa/')).toBe('web-k3x7qa');
    expect(projectIdOf('/p/web-k3x7qa/index.html')).toBe('web-k3x7qa');
    expect(projectIdOf('/pair')).toBeUndefined();
    expect(projectIdOf('/')).toBeUndefined();
  });

  it("calls the project's own API, and the computer's outside a project", () => {
    expect(apiUrl('/api/items', '/p/web-k3x7qa/')).toBe('/p/web-k3x7qa/api/items');
    expect(apiUrl('/api/pair', '/pair')).toBe('/api/pair');
    expect(apiUrl('blob:x', '/p/web-k3x7qa/')).toBe('blob:x');
  });

  it("links a project's page at one of its places", () => {
    expect(projectPage('api-b2c3d4')).toBe('/p/api-b2c3d4/#/');
    expect(projectPage('api-b2c3d4', '#/i/TASKS-1')).toBe('/p/api-b2c3d4/#/i/TASKS-1');
  });
});
