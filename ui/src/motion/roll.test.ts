import { describe, expect, it } from 'vitest';
import { rollSplit } from './roll.ts';

describe('a rolling count', () => {
  it('rolls only the digits that change', () => {
    expect(rollSplit('12', '13')).toEqual({ head: '1', out: '2', in: '3' });
    expect(rollSplit('19', '20')).toEqual({ head: '', out: '19', in: '20' });
  });

  it('lines numbers of different lengths up on the right', () => {
    expect(rollSplit('9', '10')).toEqual({ head: '', out: ' 9', in: '10' });
    expect(rollSplit('10', '9')).toEqual({ head: '', out: '10', in: ' 9' });
  });
});
