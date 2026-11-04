import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Connection } from '../../../src/core/blueprint.ts';
import { BlueprintTray, Consequence } from './Consequence.tsx';

const LINK: Connection = {
  kind: 'blocks',
  from: { board: 'bugs', type: 'bug' },
  to: { board: 'work', type: 'task' },
};
const FIX = { board: 'work', preset: 'tasks', type: 'task', state: 'in_progress' };

const render = (props: Partial<Parameters<typeof Consequence>[0]>) =>
  renderToStaticMarkup(
    createElement(Consequence, {
      link: LINK,
      gate: { kind: 'nothing', fix: { ...FIX, copy: 'product-tasks' } },
      onFix: () => {},
      busy: false,
      error: undefined,
      saveFirst: false,
      ...props,
    }),
  );

describe('the consequence of a link', () => {
  it('says a blocks link waits for nothing, and what its fix does before it does it', () => {
    const html = render({});

    expect(html).toContain('Today this waits for nothing:');
    expect(html).toContain('make in_progress wait for blockers');
    expect(html).toContain(
      'tasks is official and read-only: this copies it into the project as product-tasks v1',
    );
  });

  it('opens a draft of a project preset without copying it', () => {
    const html = render({ gate: { kind: 'nothing', fix: FIX } });

    expect(html).toContain(
      'This opens a draft of tasks where in_progress requires blockers_closed',
    );
    expect(html).not.toContain('copies it');
  });

  it('offers no fix where the blueprint is only read, and asks to save a changed draft first', () => {
    expect(render({ onFix: undefined })).not.toContain('make in_progress wait');
    expect(render({ saveFirst: true })).toContain('Save the blueprint first');
  });

  it('says where the target waits, and that other kinds are pointers', () => {
    expect(render({ gate: { kind: 'waits', state: 'in_progress' } })).toContain(
      'A task enters in_progress only once every bug in bugs that blocks it is closed.',
    );
    expect(render({ gate: { kind: 'pointer' } })).toContain('nobody waits on it');
  });
});

describe('the not on screen tray', () => {
  it('lists each link that waits for nothing, with show me', () => {
    const html = renderToStaticMarkup(
      createElement(BlueprintTray, { links: ['bugs.bug blocks work.task'], onShow: () => {} }),
    );

    expect(html).toContain('bugs.bug blocks work.task waits for nothing');
    expect(html).toContain('show me');
  });
});
