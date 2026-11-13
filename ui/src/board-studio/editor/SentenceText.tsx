import { Fragment, type ReactNode } from 'react';
import type { Selection } from '../../../../src/core/board/model.ts';
import { type MessageKey, tx } from '../../i18n/i18n.ts';
import { isName, isNames, listParts, type Sentence, type Value } from './sentences.ts';

// A sentence on the page: the board's own words set apart (<b>), the rest as the language says it.
// Given `select`, a name that points at a card (a step, Hecho) is a button that selects it.

const sayx = tx as unknown as (key: MessageKey, params?: Record<string, ReactNode>) => ReactNode;

function valueNode(v: Value, select?: (at: Selection) => void): ReactNode {
  if (isName(v)) {
    const at = v.at;
    if (!at || !select) return <b>{v.name}</b>;
    return (
      <button type="button" className="se-namelink" onClick={() => select(at)}>
        {v.name}
      </button>
    );
  }
  if (isNames(v))
    return listParts(v).map((p, i) =>
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one list never move
      p.type === 'element' ? <b key={i}>{p.value}</b> : <Fragment key={i}>{p.value}</Fragment>,
    );
  return v;
}

export function sentenceNode(s: Sentence, select?: (at: Selection) => void): ReactNode {
  const params: Record<string, ReactNode> = {};
  for (const [k, v] of Object.entries(s.params ?? {})) params[k] = valueNode(v, select);
  return sayx(s.key, params);
}

// A consequence under a choice: a short italic line, a warning in warn.
export function Conseq({ s, id }: { s: Sentence; id?: string }) {
  return (
    <p className={s.level === 'warn' ? 'se-conseq warn' : 'se-conseq'} id={id}>
      {sentenceNode(s)}
    </p>
  );
}
