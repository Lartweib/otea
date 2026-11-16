import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { compareCells, parseDelimited } from './data-view.ts';

describe('parseDelimited', () => {
  it('reads rows and quoted cells, commas and line breaks inside quotes included', () => {
    expect(parseDelimited('name,note\nana,"hola, mundo"\nbeto,"dos\nlíneas"\n', ',')).toEqual([
      ['name', 'note'],
      ['ana', 'hola, mundo'],
      ['beto', 'dos\nlíneas'],
    ]);
  });

  it('reads a doubled quote as one quote, and CRLF line ends', () => {
    expect(parseDelimited('a,b\r\n"say ""hi""",2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['say "hi"', '2'],
    ]);
  });

  it('reads tabs for a TSV and keeps empty cells', () => {
    expect(parseDelimited('a\tb\tc\n1\t\t3', '\t')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('compareCells', () => {
  afterEach(() => setLanguage('en'));

  it('sorts numbers as numbers and words in the page language, ñ after n in Spanish', () => {
    setLanguage('es');
    expect(['10', '9', '100'].sort(compareCells)).toEqual(['9', '10', '100']);
    expect(['beta', 'Alfa', 'ñu', 'nube'].sort(compareCells)).toEqual([
      'Alfa',
      'beta',
      'nube',
      'ñu',
    ]);
  });

  it('puts empty cells last', () => {
    expect(['', '2', '1'].sort(compareCells)).toEqual(['1', '2', '']);
  });
});
