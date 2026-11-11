import type { ReactNode } from 'react';
import { t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Button, Icon } from '../kit/index.ts';
import type { PresetView } from '../types.ts';
import type { Selection } from './BlueprintCanvas.tsx';
import {
  type BlueprintDraft,
  changeLink,
  KINDS,
  nextLink,
  type TypeShape,
  withoutBoard,
} from './blueprint.ts';
import { Ask } from './parts.tsx';
import type { BoardSample } from './preview.ts';

// The blueprint's inspector, asking about what is selected in plain words: a link (from, kind, to,
// what it means), a board (its preset, its items), or, with nothing selected, the list of links.

type End = { board: string; type: string };

type Parsed = { from: End; kind: string; to: End };

// A link as the draft writes it: `board.type kind board.type`.
export function parseLink(text: string): Parsed | undefined {
  const [from, kind, to] = text.trim().split(/\s+/);
  const end = (part: string | undefined) => {
    const [board, type] = (part ?? '').split('.');
    return board && type ? { board, type } : undefined;
  };
  const a = end(from);
  const b = end(to);
  return a && b && kind ? { from: a, kind, to: b } : undefined;
}

export type InspectorProps = {
  draft: BlueprintDraft;
  // Undefined while the blueprint cannot be edited here.
  set: ((draft: BlueprintDraft) => void) | undefined;
  shapes: ReadonlyMap<string, TypeShape[]>;
  presets: readonly PresetView[];
  sampleOf: (board: string) => BoardSample | undefined;
  selection: Selection | undefined;
  onSelect: (selection: Selection | undefined) => void;
  itemsOf: (board: string) => number;
  // What the link does to the gate of its target, under what it means.
  consequence?: ((text: string) => ReactNode) | undefined;
};

export function BlueprintInspector(props: InspectorProps) {
  const { selection } = props;
  const board =
    selection?.kind === 'board'
      ? props.draft.boards.find(({ name }) => name === selection.name)
      : undefined;
  const link =
    selection?.kind === 'link' &&
    props.draft.connections.some((text) => text.trim() === selection.text)
      ? selection.text
      : undefined;
  return (
    <aside className="st-insp st-bpi" aria-label={t('studio.inspect.title')}>
      {board ? <BoardInspector {...props} board={board} /> : null}
      {link ? <LinkInspector {...props} text={link} /> : null}
      {board ? null : <LinkList {...props} current={link} />}
    </aside>
  );
}

// ---------------------------------------------------------------- a link

type Words = { from: string; fromBoard: string; to: string; toBoard: string };

// What a link means, in one sentence.
function means(kind: string, words: Words): string {
  switch (kind) {
    case 'blocks':
      return t('studio.blueprint.does.blocks', words);
    case 'implements':
      return t('studio.blueprint.does.implements', words);
    case 'duplicates':
      return t('studio.blueprint.does.duplicates', words);
    default:
      return t('studio.blueprint.does.relates', words);
  }
}

function LinkInspector({
  draft,
  set,
  shapes,
  sampleOf,
  onSelect,
  consequence,
  text,
}: InspectorProps & { text: string }) {
  const link = parseLink(text);
  if (!link) return null;
  const index = draft.connections.findIndex((each) => each.trim() === text);
  const change = set
    ? (next: Parsed) => {
        const changed = changeLink(draft, text, next);
        set(changed.draft);
        onSelect({ kind: 'link', text: changed.text });
      }
    : undefined;
  const id = (end: End) => sampleOf(end.board)?.id ?? '<id>';
  const params = {
    from: link.from.type,
    fromBoard: link.from.board,
    to: link.to.type,
    toBoard: link.to.board,
  };
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.blueprint.link')}</span>
        <span className="st-insp-k">
          {t('studio.blueprint.nOf', { n: index + 1, count: draft.connections.length })}
        </span>
      </div>
      <Ask question={t('studio.blueprint.from')} yamlKey={`connections[${index}]`}>
        <EndPicker
          end={link.from}
          boards={draft.boards.map(({ name }) => name)}
          shapes={shapes}
          label={t('studio.blueprint.from')}
          onChange={change && ((from) => change({ ...link, from }))}
        />
      </Ask>
      <Ask question={t('studio.blueprint.kind')} note={t('studio.blueprint.parentStruck')}>
        <span className="st-vals">
          {[...KINDS, 'parent'].map((kind) => {
            const struck = kind === 'parent';
            const on = kind === link.kind;
            return (
              <button
                key={kind}
                type="button"
                className={`st-tog${on ? ' on' : ''}${struck ? ' struck' : ''}`}
                aria-pressed={on}
                title={struck ? t('studio.blueprint.parentStruck') : undefined}
                disabled={change === undefined || struck}
                onClick={() => change?.({ ...link, kind })}
              >
                {kind}
              </button>
            );
          })}
        </span>
      </Ask>
      <Ask question={t('studio.blueprint.to')}>
        <EndPicker
          end={link.to}
          boards={draft.boards.map(({ name }) => name).filter((name) => name !== link.from.board)}
          shapes={shapes}
          label={t('studio.blueprint.to')}
          onChange={change && ((to) => change({ ...link, to }))}
        />
      </Ask>
      <Ask question={t('studio.blueprint.whatItMeans')}>
        <p className="st-ask-n">
          <b>{means(link.kind, params)}</b> {t('studio.blueprint.agentsRun')}{' '}
          <code>{`otea link ${id(link.from)} ${link.kind} ${id(link.to)}`}</code>
        </p>
      </Ask>
      {consequence?.(text)}
      {set ? (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            set({
              ...draft,
              connections: draft.connections.filter((each) => each.trim() !== text),
            });
            onSelect(undefined);
          }}
        >
          {t('studio.blueprint.removeThis')}
        </Button>
      ) : null}
    </>
  );
}

function EndPicker({
  end,
  boards,
  shapes,
  label,
  onChange,
}: {
  end: End;
  boards: string[];
  shapes: ReadonlyMap<string, TypeShape[]>;
  label: string;
  onChange: ((end: End) => void) | undefined;
}) {
  const types = shapes.get(end.board) ?? [];
  const icon = types.find(({ name }) => name === end.type)?.icon;
  return (
    <span className="st-end">
      <select
        className="st-input st-mono"
        value={end.board}
        disabled={onChange === undefined}
        aria-label={`${label}: ${t('studio.blueprint.board')}`}
        onChange={(event) =>
          onChange?.({
            board: event.target.value,
            type: shapes.get(event.target.value)?.[0]?.name ?? '',
          })
        }
      >
        {[...new Set([end.board, ...boards])].map((board) => (
          <option key={board}>{board}</option>
        ))}
      </select>
      <span className="st-arw">.</span>
      <span className="st-end-t">
        {icon ? <TypeIcon name={icon} size={13} /> : null}
        <select
          className="st-input st-mono"
          value={end.type}
          disabled={onChange === undefined}
          aria-label={`${label}: ${t('studio.blueprint.type')}`}
          onChange={(event) => onChange?.({ board: end.board, type: event.target.value })}
        >
          {types.map(({ name }) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- the list of links

function LinkList({
  draft,
  set,
  shapes,
  onSelect,
  current,
}: InspectorProps & { current: string | undefined }) {
  const next = nextLink(draft, shapes);
  return (
    <section className="st-ask st-bpi-links">
      <div className="st-ask-h">
        <h3>{t('studio.blueprint.linksHere')}</h3>
        {set ? (
          <button
            type="button"
            className="st-tog st-insp-add"
            disabled={next === undefined}
            onClick={() => {
              if (next === undefined) return;
              set({ ...draft, connections: [...draft.connections, next] });
              onSelect({ kind: 'link', text: next });
            }}
          >
            <Icon name="plus" />
            {t('studio.blueprint.addLink')}
          </button>
        ) : null}
      </div>
      <ul className="st-bpi-list">
        {draft.connections.map((text) => {
          const link = parseLink(text);
          return (
            <li key={text}>
              <button
                type="button"
                aria-pressed={current === text.trim()}
                onClick={() =>
                  onSelect(
                    current === text.trim() ? undefined : { kind: 'link', text: text.trim() },
                  )
                }
              >
                {link ? (
                  <>
                    <code>{`${link.from.board}.${link.from.type}`}</code>
                    <span className="st-bpc-pill" data-kind={link.kind}>
                      {link.kind}
                    </span>
                    <code>{`${link.to.board}.${link.to.type}`}</code>
                  </>
                ) : (
                  <code>{text}</code>
                )}
              </button>
            </li>
          );
        })}
        {draft.connections.length === 0 ? (
          <li className="st-ask-n">{t('studio.blueprint.noLinks')}</li>
        ) : null}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- a board

function BoardInspector({
  draft,
  set,
  presets,
  shapes,
  onSelect,
  itemsOf,
  board,
}: InspectorProps & { board: { name: string; preset: string } }) {
  const items = itemsOf(board.name);
  const version = presets.find(({ name }) => name === board.preset)?.version;
  const types = shapes.get(board.name) ?? [];
  return (
    <>
      <div className="st-insp-h">
        <span className="st-insp-k">{t('studio.blueprint.board')}</span>
      </div>
      <h2 className="st-insp-name">{board.name}</h2>
      <Ask
        question={t('studio.blueprint.builtFrom')}
        yamlKey={`boards.${board.name}.preset`}
        note={items > 0 ? t('studio.blueprint.presetKept') : undefined}
      >
        <select
          className="st-input st-mono"
          value={board.preset}
          disabled={set === undefined || items > 0}
          aria-label={t('studio.blueprint.preset')}
          onChange={(event) =>
            set?.({
              ...draft,
              boards: draft.boards.map((each) =>
                each.name === board.name ? { ...each, preset: event.target.value } : each,
              ),
            })
          }
        >
          {presets.map(({ name, version: v }) => (
            <option key={name} value={name}>{`${name} v${v}`}</option>
          ))}
        </select>
      </Ask>
      <Ask question={t('studio.blueprint.whatLives')}>
        <p className="st-ask-n">
          <b className="st-mono">{version ? `${board.preset} v${version}` : board.preset}</b>
          {` · ${t('studio.blueprint.types', { count: types.length })} · ${t('studio.blueprint.items', { count: items })}`}
        </p>
      </Ask>
      {set ? (
        <div className="st-insp-f">
          <Button
            variant="quiet"
            size="sm"
            disabled={items > 0}
            title={items > 0 ? t('studio.blueprint.keepsItems') : undefined}
            onClick={() => {
              set(withoutBoard(draft, board.name));
              onSelect(undefined);
            }}
          >
            {t('studio.blueprint.removeBoardShort')}
          </Button>
          {items > 0 ? <span className="st-ask-n">{t('studio.blueprint.keepsItems')}</span> : null}
        </div>
      ) : null}
    </>
  );
}
