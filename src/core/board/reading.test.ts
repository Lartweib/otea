import { describe, expect, it } from 'vitest';
import { evidenceByName, fieldsByName, readFieldInput, stateName } from './reading.ts';
import { creatures } from './testing.ts';

const def = creatures();

describe('reading a board item by names', () => {
  it('takes a field by its name or id, and a choice by its name or id', () => {
    expect(readFieldInput(def, { bioma: 'pantano', fdesc: 'Lenta' })).toEqual({
      fbiome: 'cswamp',
      fdesc: 'Lenta',
    });
    expect(readFieldInput(def, { Bioma: 'cwood' })).toEqual({ fbiome: 'cwood' });
    expect(readFieldInput(def, { Comprobaciones: 'Silueta, Paleta' })).toEqual({
      fsteps: '["cone","ctwo"]',
    });
    expect(readFieldInput(def, { Título: 'Rana' })).toEqual({ title: 'Rana' });
  });

  it('refuses a name the board has not, and a value no choice has, naming what there is', () => {
    expect(() => readFieldInput(def, { Tamaño: 'Una' })).toThrowError(
      'Criaturas has no field "Tamaño"; its fields are Descripción, Bioma, Comprobaciones',
    );
    expect(() => readFieldInput(def, { Bioma: 'Desierto' })).toThrowError(
      'Bioma must be one of Pantano, Bosque',
    );
  });

  it('names evidence, states and stored values the way the person wrote them', () => {
    expect(evidenceByName(def, 'arte conceptual')).toBe('eart');
    expect(() => evidenceByName(def, 'Bocetos')).toThrowError(/has no evidence "Bocetos"/);
    expect(stateName(def, 'sconcept')).toBe('Concepto');
    expect(stateName(def, 'sconcept__review')).toBe('Concepto (in review)');
    expect(stateName(def, 'done')).toBe('Done');
    expect(fieldsByName(def, { fbiome: 'cswamp', fdesc: 'Lenta' })).toEqual({
      Bioma: 'Pantano',
      Descripción: 'Lenta',
    });
  });
});
