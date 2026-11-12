import { Fragment, type ReactNode } from 'react';
import { type MessageKey, tx } from '../../i18n/i18n.ts';
import { isName, isNames, listParts, type Sentence, type Value } from './sentences.ts';

// A sentence on the page: the board's own words set apart (<b>), the rest as the language says it.

const sayx = tx as unknown as (key: MessageKey, params?: Record<string, ReactNode>) => ReactNode;

function valueNode(v: Value): ReactNode {
  if (isName(v)) return <b>{v.name}</b>;
  if (isNames(v))
    return listParts(v).map((p, i) =>
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one list never move
      p.type === 'element' ? <b key={i}>{p.value}</b> : <Fragment key={i}>{p.value}</Fragment>,
    );
  return v;
}

export function sentenceNode(s: Sentence): ReactNode {
  const params: Record<string, ReactNode> = {};
  for (const [k, v] of Object.entries(s.params ?? {})) params[k] = valueNode(v);
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
