import { describe, expect, it } from 'vitest';
import { moveTo } from './register.ts';

const HERE = 'https://desk.tail1.ts.net/p/alpha-aaaaaa/#/';

describe('moveTo', () => {
  it("moves within this project's page by its hash", () => {
    expect(moveTo('/p/alpha-aaaaaa/#/i/PED-1', HERE)).toEqual({ hash: '#/i/PED-1' });
  });

  it("loads another project's page for a notice about it", () => {
    expect(moveTo('/p/beta-bbbbbb/#/i/PED-1', HERE)).toEqual({
      page: 'https://desk.tail1.ts.net/p/beta-bbbbbb/#/i/PED-1',
    });
  });

  it('never leaves for another site', () => {
    expect(moveTo('https://evil.example/#/', HERE)).toBeUndefined();
  });
});
