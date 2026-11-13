import { describe, expect, it } from 'vitest';
import { evidenceByName, fieldsByName, readFieldInput, stateName } from './reading.ts';
import { creatures, errores } from './testing.ts';

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

  it('fills the board description field when given "description", in any language', () => {
    // Criaturas has one long text, Descripción: "description" fills it.
    expect(readFieldInput(def, { description: 'Lenta' })).toEqual({ fdesc: 'Lenta' });
    // A board with several long texts takes the one named Description, in English or Spanish.
    const several = errores();
    several.parts.fdesc = { id: 'fdesc', name: 'Descripción', kind: 'long', hint: '', options: [] };
    several.form = [...several.form, { ref: 'fdesc', required: true }];
    expect(readFieldInput(several, { description: 'Se cae' })).toEqual({ fdesc: 'Se cae' });
  });

  it('refuses "description" with the long texts named when the board has no single one', () => {
    const several = errores();
    several.parts.fnotes = { id: 'fnotes', name: 'Notas', kind: 'long', hint: '', options: [] };
    several.form = [...several.form, { ref: 'fnotes', required: true }];
    expect(() => readFieldInput(several, { description: 'x' })).toThrowError(
      'Errores has no description field; fill one of its long texts by name: Pasos, Notas',
    );
  });

  it('refuses the description field given twice, once as "description" and once by its name', () => {
    expect(() => readFieldInput(def, { description: 'a', Descripción: 'b' })).toThrowError(
      'Descripción given twice',
    );
  });
});
