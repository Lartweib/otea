import type { CSSProperties, MouseEvent } from 'react';
import { ageLabel } from '../format.ts';
import { cellText, type GridColumn, type ShownColumn, type Sort } from '../grid.ts';
import { useActiveLease } from '../hooks.ts';
import { typeOf } from '../item-types.ts';
import { Icon, NodeMark, Pill, Severity, type SeverityLevel } from '../kit/index.ts';
import { type Block, type LaneLayout, laneX, layoutLanes } from '../lanes.ts';
import { itemNodeKind } from '../node-kind.ts';
import type { Section } from '../sections.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';
import { Carry } from './Carry.tsx';
import { GroupLabel } from './GroupLabel.tsx';
import { Holder, Lines } from './ItemList.tsx';

// The grid's rows are one line: 40px, the node at y=20 (10px). Group headers are 34px over the
// first group and 46 over the others, the label on the id column.
export const GRID_ROW = { height: 40, node: 20, first: 34, head: 46 } as const;

type Place = { top: number; height: number };

const LEVELS = ['low', 'medium', 'high', 'critical'];

function Check() {
  return (
    <i aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path className="grid-ck" d="M2 5.2 L4.1 7.2 L8 2.9" />
        <path className="grid-dash" d="M2.5 5 H7.5" />
      </svg>
    </i>
  );
}

function Cell({ item, column, compact }: { item: Item; column: GridColumn; compact: boolean }) {
  const text = cellText(item, column);
  const lease = useActiveLease(item.lease);
  switch (column.kind) {
    case 'id':
      return <span data-m={`${item.id}:i`}>{text}</span>;
    case 'title':
      return (
        <a
          className="grid-ttl row-link"
          href={hashFor(item.id)}
          title={text}
          data-m={`${item.id}:t`}
        >
          {text}
        </a>
      );
    case 'state':
      // A row waiting for you says so with its node; the state pill stays untinted.
      return (
        <Pill tone="state" size="sm">
          <span data-m={`${item.id}:s`}>{text}</span>
        </Pill>
      );
    case 'who': {
      const holder = lease?.holder;
      return holder ? (
        <span className="grid-who" data-compact={compact || undefined}>
          <Holder holder={holder} m={`${item.id}:w`} />
        </span>
      ) : (
        <i className="grid-nobody" role="img" aria-label="nobody" />
      );
    }
    case 'age':
      return <span data-m={`${item.id}:a`}>{ageLabel(text, Date.now())}</span>;
    case 'severity': {
      const level = LEVELS.indexOf(text) + 1;
      if (level === 0) return text === '' ? null : <span>{text}</span>;
      return (
        <span className="grid-sev" title={`Severity ${text}, ${level} of 4`}>
          <Severity level={level as SeverityLevel} />
          {compact ? null : <span className="grid-sevl">{text}</span>}
        </span>
      );
    }
    case 'enum':
    case 'type':
      return text === '' ? null : <span className="grid-tag">{text}</span>;
    default:
      return <span className="grid-text">{text}</span>;
  }
}

type RowProps = {
  item: Item;
  collection: CollectionView | undefined;
  shown: readonly ShownColumn[];
  place: Place;
  lanes: LaneLayout;
  selected: boolean;
  checked: boolean;
  onCheck: (id: string, range: boolean) => void;
};

function GridRow({ item, collection, shown, place, lanes, selected, checked, onCheck }: RowProps) {
  const lease = useActiveLease(item.lease);
  const kind = itemNodeKind(item, typeOf(collection, item.type), lease !== null);
  const x = laneX(item.turn);
  const { height, node } = GRID_ROW;
  return (
    <tr
      className="grid-row"
      data-flip={item.id}
      data-turn={item.turn}
      data-x={x}
      data-kind={kind}
      data-current={selected || undefined}
      data-checked={checked || undefined}
    >
      <td className="gc gc-turn">
        <Lines lanes={lanes} place={place} />
        <svg
          className="row-node grid-node"
          width="56"
          height={height}
          viewBox={`0 0 56 ${height}`}
          aria-hidden="true"
        >
          <circle className="ghost" cx={x} cy={node} r="5" />
          <g data-m={`${item.id}:n`}>
            <g className="carry">
              <g className="lift">
                <circle className="halo" cx={x} cy={node} r="5" />
                <NodeMark kind={kind} cx={x} cy={node} r={5} />
              </g>
            </g>
          </g>
        </svg>
      </td>
      <td className="gc gc-chk">
        <button
          type="button"
          className="grid-check"
          aria-pressed={checked}
          aria-label={`Select ${item.id}`}
          onClick={(event: MouseEvent) => onCheck(item.id, event.shiftKey)}
        >
          <Check />
        </button>
      </td>
      {shown.map(({ column, compact }) => (
        <td key={column.key} className={`gc gc-${column.kind}`}>
          <Cell item={item} column={column} compact={compact} />
        </td>
      ))}
    </tr>
  );
}

type HeadProps = {
  shown: readonly ShownColumn[];
  sort: Sort;
  menu: string | undefined;
  onSort: (column: GridColumn) => void;
  onMenu: (column: GridColumn, anchor: HTMLElement) => void;
  all: boolean | 'mixed';
  onCheckAll: () => void;
};

const SHORT: Record<string, string> = { severity: 'sev' };

function GridHead({ shown, sort, menu, onSort, onMenu, all, onCheckAll }: HeadProps) {
  return (
    <thead className="grid-thead">
      <tr className="grid-head">
        <th className="gh gh-turn" scope="col">
          <span className="visually-hidden">Whose turn</span>
        </th>
        <th className="gh gh-chk" scope="col">
          <button
            type="button"
            className="grid-check"
            aria-pressed={all}
            aria-label="Select every item shown"
            onClick={onCheckAll}
          >
            <Check />
          </button>
        </th>
        {shown.map(({ column, compact }) => {
          const on = sort?.key === column.key ? sort.dir : undefined;
          const label = compact ? (SHORT[column.key] ?? column.label) : column.label;
          return (
            <th
              key={column.key}
              className={`gh gh-${column.kind}`}
              scope="col"
              data-col={column.key}
              aria-sort={on === 'asc' ? 'ascending' : on === 'desc' ? 'descending' : 'none'}
              data-sort={on}
              data-menu={menu === column.key || undefined}
              data-compact={compact || undefined}
            >
              <button
                type="button"
                className="gh-sort"
                title={
                  on
                    ? `Sorted ${on === 'asc' ? 'ascending' : 'descending'}`
                    : `Sort by ${column.label}`
                }
                onClick={() => onSort(column)}
              >
                <span>{label}</span>
                <Icon name="up" />
              </button>
              <button
                type="button"
                className="gh-menu"
                aria-haspopup="menu"
                aria-expanded={menu === column.key}
                aria-label={`Sort, filter or group by ${column.label}`}
                onClick={(event) => onMenu(column, event.currentTarget)}
              >
                <Icon name="chevron" />
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

// Where every block of the grid sits and the lanes over all of them, laid out as the list's are, so
// the lanes keep meaning turn whatever the grouping: a closed item in an open group sits on the
// trunk between them.
function geometryOf(sections: readonly Section[]) {
  const blocks: Block[] = [];
  const heads = new Map<string, Place>();
  const rows = new Map<string, Place>();
  let top = 0;
  const add = (block: Block): Place => {
    const place = { top, height: block.height };
    blocks.push(block);
    top += block.height;
    return place;
  };
  sections.forEach((section, index) => {
    heads.set(section.key, add({ height: index === 0 ? GRID_ROW.first : GRID_ROW.head }));
    for (const item of section.items) {
      const between = item.turn === 'none' && section.turn !== 'none';
      const block: Block = { height: GRID_ROW.height, turn: item.turn, node: GRID_ROW.node };
      rows.set(item.id, add(between ? { ...block, between } : block));
    }
  });
  return { lanes: layoutLanes(blocks), heads, rows };
}

type ItemGridProps = {
  sections: readonly Section[];
  collection: CollectionView | undefined;
  shown: readonly ShownColumn[];
  template: string;
  sort: Sort;
  menu: string | undefined;
  onSort: (column: GridColumn) => void;
  onMenu: (column: GridColumn, anchor: HTMLElement) => void;
  checked: ReadonlySet<string>;
  onCheck: (id: string, range: boolean) => void;
  onCheckAll: () => void;
  selectedId: string | undefined;
  scope: string;
  severityGroups: boolean;
};

const NO_PLACE: Place = { top: 0, height: GRID_ROW.height };

// The grid view of a collection: a table that keeps the list's lanes in its first column, so whose
// turn it is reads before anything else. Group headers, a sticky header row that sorts and opens
// each column's menu, a select box per row. Rows are carried as the list's are (Carry).
export function ItemGrid({
  sections,
  collection,
  shown,
  template,
  sort,
  menu,
  onSort,
  onMenu,
  checked,
  onCheck,
  onCheckAll,
  selectedId,
  scope,
  severityGroups,
}: ItemGridProps) {
  const groups = sections.filter((section) => section.items.length > 0);
  const { lanes, heads, rows } = geometryOf(groups);
  const ids = groups.flatMap((section) => section.items.map(({ id }) => id));
  const picked = ids.filter((id) => checked.has(id)).length;
  const all = picked === 0 ? false : picked === ids.length ? true : 'mixed';
  const span = shown.length + 2;
  return (
    <table
      className="grid"
      aria-label={collection?.name ?? 'Items'}
      style={{ '--cols': template } as CSSProperties}
      data-picking={checked.size > 0 || undefined}
      data-lanes={JSON.stringify([lanes.agentLane, lanes.youLane, lanes.trunk])}
    >
      <GridHead
        shown={shown}
        sort={sort}
        menu={menu}
        onSort={onSort}
        onMenu={onMenu}
        all={all}
        onCheckAll={onCheckAll}
      />
      <Carry as="tbody" scope={scope} className="lanes-body grid-body">
        {groups.flatMap((section) => [
          <tr
            key={`head:${section.key}`}
            className="grid-gh"
            data-turn={section.turn}
            data-flip={`ghead:${section.key}`}
            style={{ height: heads.get(section.key)?.height }}
          >
            <th className="grid-gh-cell" colSpan={span} scope="colgroup">
              <Lines lanes={lanes} place={heads.get(section.key) ?? NO_PLACE} />
              <GroupLabel
                section={section}
                total={section.items.length}
                severity={severityGroups}
              />
            </th>
          </tr>,
          ...section.items.map((item) => (
            <GridRow
              key={item.id}
              item={item}
              collection={collection}
              shown={shown}
              place={rows.get(item.id) ?? NO_PLACE}
              lanes={lanes}
              selected={item.id === selectedId}
              checked={checked.has(item.id)}
              onCheck={onCheck}
            />
          )),
        ])}
      </Carry>
    </table>
  );
}
