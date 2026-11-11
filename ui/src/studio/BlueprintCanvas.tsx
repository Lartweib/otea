import type { Connection } from '../../../src/core/blueprint.ts';
import { t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Icon, Seg } from '../kit/index.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import type { PresetView } from '../types.ts';
import type { Board } from './api.ts';
import {
  CARD_W,
  type Card,
  type CardMode,
  canvasSize,
  cardLinks,
  connectionText,
  layoutCards,
  type TypeShape,
} from './blueprint.ts';
import type { BoardSample } from './preview.ts';

// The blueprint drawn as the board S3-Blueprint draws it: each board a card with its icon, its
// preset, its types and one sample row, and the links between types as lines whose end says the
// kind. On a phone, the same cards stacked, and the links as a list.

export type Selection = { kind: 'link'; text: string } | { kind: 'board'; name: string };

type CanvasProps = {
  boards: readonly Board[];
  connections: readonly Connection[];
  shapes: ReadonlyMap<string, TypeShape[]>;
  presets: readonly PresetView[];
  iconOf: (board: string) => string | undefined;
  sampleOf: (board: string) => BoardSample | undefined;
  mode: CardMode;
  onMode: (mode: CardMode) => void;
  selected: Selection | undefined;
  onSelect: (selection: Selection | undefined) => void;
  // Undefined while the blueprint cannot be edited here: no + board.
  onAddBoard: (() => void) | undefined;
};

const MARKER: Record<string, string | undefined> = {
  blocks: 'url(#st-bpc-bar)',
  implements: 'url(#st-bpc-head)',
  duplicates: 'url(#st-bpc-head)',
};

export function BlueprintCanvas(props: CanvasProps) {
  const { boards, connections, shapes, mode, onMode, selected, onSelect, onAddBoard } = props;
  const cards = layoutCards(boards, connections, shapes, mode, (board) =>
    Boolean(props.sampleOf(board)),
  );
  const links = cardLinks(cards, connections);
  const { width, height } = canvasSize(cards);
  const isLink = (text: string) => selected?.kind === 'link' && selected.text === text;
  // The ports a link leaves or enters, drawn filled; the rows of the selected link, lit.
  const linked = new Set(
    links.flatMap(({ connection: { from, to }, sides }) => [
      `${from.board}.${from.type}:${sides.from}`,
      `${to.board}.${to.type}:${sides.to}`,
    ]),
  );
  const lit = new Set(
    links
      .filter(({ text }) => isLink(text))
      .flatMap(({ connection: { from, to } }) => [
        `${from.board}.${from.type}`,
        `${to.board}.${to.type}`,
      ]),
  );
  return (
    <div className="st-bpc-at">
      <div className="st-bpc-bar">
        <Seg
          label={t('studio.blueprint.canvas.show')}
          value={mode}
          options={(['types', 'states'] as const).map((each) => ({
            value: each,
            label:
              each === 'types'
                ? t('studio.blueprint.canvas.types')
                : t('studio.blueprint.canvas.states'),
          }))}
          onChange={onMode}
        />
        <span className="st-bpc-n">{t('studio.blueprint.canvas.drawn')}</span>
        {onAddBoard ? (
          <button type="button" className="st-tog st-bpc-add" onClick={onAddBoard}>
            <Icon name="plus" />
            {t('studio.blueprint.addBoard')}
          </button>
        ) : null}
      </div>
      {/* A click on the canvas itself, not on a card or a link, selects nothing. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the cards and links are the buttons */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: selecting nothing is also the list's back */}
      <div
        className="st-bpc"
        style={{ width, height }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(undefined);
        }}
      >
        <svg
          className="st-bpc-svg"
          width={width}
          height={height}
          role="img"
          aria-label={t('studio.blueprint.diagramAria')}
        >
          <defs>
            <marker
              id="st-bpc-bar"
              viewBox="0 0 4 14"
              refX="2"
              refY="7"
              markerWidth="4"
              markerHeight="14"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M2 0 V14" className="st-bpc-mk" />
            </marker>
            <marker
              id="st-bpc-head"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="10"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M1 1 L9 5 L1 9" className="st-bpc-mk" />
            </marker>
          </defs>
          {links.map((link) => (
            <g
              key={link.text}
              className="st-bpc-link"
              data-kind={link.connection.kind}
              data-on={isLink(link.text) || undefined}
            >
              <path className="st-bpc-lk" d={link.d} markerEnd={MARKER[link.connection.kind]} />
            </g>
          ))}
        </svg>
        {cards.map((card) => (
          <BoardCard
            key={card.board.name}
            card={card}
            mode={mode}
            version={props.presets.find(({ name }) => name === card.board.preset)?.version}
            icon={props.iconOf(card.board.name)}
            sample={props.sampleOf(card.board.name)}
            linked={linked}
            lit={lit}
            current={selected?.kind === 'board' && selected.name === card.board.name}
            onSelect={() => onSelect({ kind: 'board', name: card.board.name })}
          />
        ))}
        {links.map((link) => (
          <button
            key={link.text}
            type="button"
            className="st-bpc-pill"
            data-kind={link.connection.kind}
            data-link={link.text}
            aria-pressed={isLink(link.text)}
            aria-label={link.text}
            style={{ left: link.label.x, top: link.label.y }}
            onClick={() =>
              onSelect(isLink(link.text) ? undefined : { kind: 'link', text: link.text })
            }
          >
            {link.connection.kind}
          </button>
        ))}
      </div>
      <Legend />
    </div>
  );
}

type CardProps = {
  card: Card;
  mode: CardMode;
  version: number | undefined;
  icon: string | undefined;
  sample: BoardSample | undefined;
  linked: ReadonlySet<string>;
  lit: ReadonlySet<string>;
  current: boolean;
  onSelect: () => void;
};

function BoardCard(props: CardProps) {
  const { card, mode, version, icon, sample, linked, lit, current, onSelect } = props;
  const { board } = card;
  return (
    <section
      className="st-bc"
      data-board={board.name}
      aria-current={current || undefined}
      style={{ left: card.x, top: card.y, width: CARD_W, height: card.h }}
    >
      <CardHead
        board={board}
        version={version}
        icon={icon}
        types={card.rows.length}
        onSelect={onSelect}
      />
      {card.rows.map(({ type }) => {
        const end = `${board.name}.${type.name}`;
        return (
          <div key={type.name} className="st-bc-type">
            <div className="st-bc-t" data-on={lit.has(end) || undefined}>
              <i className="st-port l" data-on={linked.has(`${end}:l`) || undefined} />
              {type.icon ? <TypeIcon name={type.icon} size={14} /> : null}
              <span className="st-mono">{type.name}</span>
              <i className="st-port r" data-on={linked.has(`${end}:r`) || undefined} />
            </div>
            {mode === 'states' ? <States type={type} /> : null}
          </div>
        );
      })}
      {sample ? <SampleRow sample={sample} /> : null}
    </section>
  );
}

function CardHead({
  board,
  version,
  icon,
  types,
  onSelect,
}: {
  board: Board;
  version: number | undefined;
  icon: string | undefined;
  types: number;
  onSelect?: () => void;
}) {
  const inner = (
    <>
      <span className="st-bc-i">{icon ? <TypeIcon name={icon} size={15} /> : null}</span>
      <span className="st-bc-n">
        <b>{board.name}</b>
        <span className="st-mono">{version ? `${board.preset} v${version}` : board.preset}</span>
      </span>
      <span className="st-bc-c">{t('studio.blueprint.types', { count: types })}</span>
    </>
  );
  return onSelect ? (
    <button type="button" className="st-bc-h" onClick={onSelect}>
      {inner}
    </button>
  ) : (
    <div className="st-bc-h">{inner}</div>
  );
}

function States({ type }: { type: TypeShape }) {
  return (
    <ul className="st-bc-states">
      {type.states.map((state) => (
        <li key={state.name} data-waits={state.waits}>
          {state.waits ? <span className="st-bc-wi">⧗</span> : <i />}
          <span className="st-mono">{state.name}</span>
          {state.waits ? (
            <span className="st-bc-w">
              {state.waits === 'blockers'
                ? t('studio.blueprint.canvas.waitsBlockers')
                : t('studio.blueprint.canvas.waitsChildren')}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SampleRow({ sample }: { sample: BoardSample }) {
  return (
    <div className="st-bc-x">
      <NodeGlyph look={sample.node} size={16} />
      <span className="st-bc-xt">{sample.title}</span>
      <span className="st-bc-xm st-mono">{`${sample.id} · ${sample.state}`}</span>
    </div>
  );
}

function Legend() {
  return (
    <p className="st-bpc-legend">
      <span>
        <svg width="28" height="10" aria-hidden="true">
          <path d="M1 5 H26 M26 0 V10" />
        </svg>
        {t('studio.blueprint.legendBlocks')}
      </span>
      <span>
        <svg width="28" height="10" aria-hidden="true">
          <path d="M1 5 H26 M21 1 L26 5 L21 9" />
        </svg>
        {t('studio.blueprint.legendImplements')}
      </span>
      <span>
        <svg width="28" height="10" aria-hidden="true">
          <path d="M1 5 H27" strokeDasharray="4 3" />
        </svg>
        {t('studio.blueprint.legendRelates')}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- on a phone

type ListProps = Pick<
  CanvasProps,
  'boards' | 'connections' | 'shapes' | 'presets' | 'iconOf' | 'sampleOf'
>;

// The phone draws no diagram: the cards one under the other at full size, then each link as a line
// of text, so nothing is scaled down to be unreadable.
export function BoardList({ boards, connections, shapes, presets, iconOf, sampleOf }: ListProps) {
  return (
    <div className="st-bpl">
      {boards.map((board) => {
        const types = shapes.get(board.name) ?? [];
        const sample = sampleOf(board.name);
        return (
          <section key={board.name} className="st-bc" data-board={board.name}>
            <CardHead
              board={board}
              version={presets.find(({ name }) => name === board.preset)?.version}
              icon={iconOf(board.name)}
              types={types.length}
            />
            {types.map((type) => (
              <div key={type.name} className="st-bc-t">
                {type.icon ? <TypeIcon name={type.icon} size={14} /> : null}
                <span className="st-mono">{type.name}</span>
              </div>
            ))}
            {sample ? <SampleRow sample={sample} /> : null}
          </section>
        );
      })}
      <ul className="st-bpl-links" aria-label={t('studio.blueprint.links')}>
        {connections.map((connection) => (
          <li key={connectionText(connection)}>
            <code>{`${connection.from.board}.${connection.from.type}`}</code>
            <span className="st-bpc-pill" data-kind={connection.kind}>
              {connection.kind}
            </span>
            <code>{`${connection.to.board}.${connection.to.type}`}</code>
          </li>
        ))}
        {connections.length === 0 ? <li>{t('studio.blueprint.noLinks')}</li> : null}
      </ul>
    </div>
  );
}
