import { describe, expect, it } from 'vitest';
import { compileBoard } from './compile.ts';
import { blankBoard, instantiate, TEMPLATES } from './templates.ts';
import { creatures } from './testing.ts';

describe('compileBoard', () => {
  it('turns a board version into the preset the rest of Otea reads', () => {
    const preset = compileBoard('bcria', 4, creatures());
    expect(preset.name).toBe('bcria');
    expect(preset.version).toBe(4);
    expect(preset.icon).toBe('paw');
    const [type] = preset.types;
    expect(type?.name).toBe('item');
    expect(type?.label).toBe('Criatura');
    expect(preset.workflow.initial).toBe('sconcept');
    expect(preset.workflow.states.map(({ name, turn }) => `${name}:${turn}`)).toEqual([
      'sconcept:agent',
      'sconcept__review:human',
      'sanimate:agent',
      'sanimate__review:agent',
      'sanimate__yours:human',
      'spolish:human',
      'done:none',
      'dropped:none',
    ]);
  });

  it('allows exactly the moves the step engine makes, and dropping by you', () => {
    const { transitions } = compileBoard('bcria', 1, creatures()).workflow;
    const moves = transitions.map(
      ({ from, to, by, reasonRequired }) => `${from}>${to}:${by}${reasonRequired ? '!' : ''}`,
    );
    expect(moves).toEqual([
      'sconcept>sconcept__review:agent',
      'sconcept__review>sanimate:human',
      'sconcept__review>done:human-ui',
      'sconcept__review>sconcept:human!',
      'sanimate>sanimate__review:agent',
      'sanimate>sanimate__yours:agent',
      'sanimate__review>spolish:agent',
      'sanimate__review>sconcept:agent!',
      'sanimate__yours>spolish:human',
      'sanimate__yours>sconcept:human!',
      'spolish>done:human-ui',
      ...[
        'sconcept',
        'sconcept__review',
        'sanimate',
        'sanimate__review',
        'sanimate__yours',
        'spolish',
      ].map((state) => `${state}>dropped:human!`),
    ]);
  });

  it('maps fields to modules, names them in both languages and keeps choices as ids', () => {
    const preset = compileBoard('bcria', 1, creatures());
    expect(preset.fields.title).toEqual({ module: 'text', required: 'create', label: 'Título' });
    expect(preset.fields.fdesc).toEqual({
      module: 'markdown',
      required: 'create',
      label: 'Descripción',
    });
    expect(preset.fields.fbiome).toEqual({
      module: 'enum',
      values: ['cswamp', 'cwood'],
      label: 'Bioma',
    });
    const labels = preset.types[0]?.labels;
    expect(labels?.es?.states.sconcept__review).toBe('Concepto');
    expect(labels?.en?.states.done).toBe('Done');
    expect(labels?.es?.states.dropped).toBe('Descartado');
    expect(labels?.es?.values?.fbiome).toEqual({ cswamp: 'Pantano', cwood: 'Bosque' });
  });

  it('names a level field’s values in both languages (the Tabla groups by them)', () => {
    const def = creatures();
    const level = { id: 'fsev', name: 'Severidad', kind: 'level' as const, hint: '', options: [] };
    const preset = compileBoard('bcria', 1, {
      ...def,
      parts: { ...def.parts, fsev: level },
      form: [...def.form, { ref: 'fsev', required: false }],
    });
    const labels = preset.types[0]?.labels;
    expect(labels?.es?.values?.fsev).toEqual({
      low: 'baja',
      medium: 'media',
      high: 'alta',
      critical: 'crítica',
    });
    expect(labels?.en?.values?.fsev?.critical).toBe('critical');
  });

  it('lays the item page out from Acomodar zones, evidence modules carrying the part id', () => {
    const layout = compileBoard('bcria', 1, creatures()).types[0]?.layout;
    expect(layout?.body).toEqual([
      { module: 'markdown', field: 'fdesc', label: 'Descripción' },
      { module: 'images', id: 'eart', variant: 'gallery', label: 'Arte conceptual' },
      { module: 'recording', id: 'eanim', variant: 'frames', label: 'Animación' },
      { module: 'text', field: 'fsteps', label: 'Comprobaciones' },
      { module: 'diff', id: 'ecode', label: 'Cambios de código' },
      { module: 'images', id: 'eswamp', variant: 'single', label: 'Barro' },
    ]);
    expect(layout?.side).toEqual([
      { module: 'enum', field: 'fbiome', label: 'Bioma' },
      { module: 'relations' },
    ]);
    expect(layout?.row).toEqual([{ module: 'enum', field: 'fbiome', label: 'Bioma' }]);
    expect(layout?.intake).toEqual([
      { module: 'text', field: 'title', label: 'Título' },
      { module: 'markdown', field: 'fdesc', label: 'Descripción' },
      { module: 'enum', field: 'fbiome', label: 'Bioma' },
    ]);
  });

  it('draws audio and other files with the files module, so agents can attach them', () => {
    const def = creatures();
    def.parts.evoice = { id: 'evoice', name: 'Voz', kind: 'audio', hint: '', options: [] };
    def.parts.efile = { id: 'efile', name: 'Proyecto', kind: 'file', hint: '', options: [] };
    def.steps[0]?.hand.push(
      { ref: 'evoice', req: 'no', fresh: false },
      { ref: 'efile', req: 'no', fresh: false },
    );
    def.layout.efile = 'side';

    const layout = compileBoard('bcria', 1, def).types[0]?.layout;

    expect(layout?.body).toContainEqual({ module: 'files', id: 'evoice', label: 'Voz' });
    expect(layout?.side).toContainEqual({ module: 'files', id: 'efile', label: 'Proyecto' });
  });

  it('compiles every template and a blank board', () => {
    for (const template of TEMPLATES.filter(({ hidden }) => !hidden)) {
      for (const lang of ['en', 'es'] as const) {
        expect(() => compileBoard('bx', 1, instantiate(template, lang, {}))).not.toThrow();
      }
    }
    expect(() => compileBoard('bx', 1, blankBoard('es', { name: 'X' }))).not.toThrow();
  });

  it('leaves out a list column whose part nothing uses any more', () => {
    const def = creatures();
    def.form = def.form.filter(({ ref }) => ref !== 'fbiome');
    const layout = compileBoard('bx', 1, def).types[0]?.layout;
    expect(layout?.row ?? []).toEqual([]);
  });

  it('refuses a board without steps, which cannot be published', () => {
    expect(() => compileBoard('bx', 1, { ...creatures(), steps: [] })).toThrow(/no steps/);
  });
});
