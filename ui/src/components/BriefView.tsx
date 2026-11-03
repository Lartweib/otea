import { useEffect, useRef, useState } from 'react';
import { writeBrief } from '../api.ts';
import { briefFileName, reorder, toggleIn, type WrittenBrief } from '../brief.ts';
import { listOf, t } from '../i18n/i18n.ts';
import { Button, Icon, NodeMark } from '../kit/index.ts';
import { activeLease } from '../lease.ts';
import { renderMarkdown } from '../markdown.ts';
import { itemNodeKind } from '../node-kind.ts';
import { briefHash, hashFor, ITEMS_HASH } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';

type BriefViewProps = {
  // The items in the order the person put them, from the address.
  ids: readonly string[];
  items: readonly Item[];
  collections: readonly CollectionView[];
  // A new version means an item changed: the brief is written again from the project.
  version: number;
};

type Written =
  | { status: 'writing' }
  | { status: 'ready'; brief: WrittenBrief }
  | { status: 'failed'; message: string };

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// The brief is asked for again once the typing stops for a moment.
const TYPING_MS = 250;

function useBrief(
  ids: readonly string[],
  limits: string | undefined,
  success: string | undefined,
  version: number,
): Written {
  const [written, setWritten] = useState<Written>({ status: 'writing' });
  const wanted = JSON.stringify([ids, limits, success]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `wanted` holds every input
  useEffect(() => {
    if (ids.length === 0) return;
    let live = true;
    const timer = setTimeout(() => {
      writeBrief({
        ids,
        ...(limits === undefined ? {} : { limits: lines(limits) }),
        ...(success === undefined ? {} : { success: lines(success) }),
      }).then(
        (brief) => live && setWritten({ status: 'ready', brief }),
        (error: unknown) =>
          live &&
          setWritten({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          }),
      );
    }, TYPING_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted, version]);
  return written;
}

function exportFile(markdown: string, ids: readonly string[]): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = briefFileName(ids);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Page 06: the items of a brief in their order on the left, with the limits and success lines; the
// brief itself beside them as a document (or its Markdown), to copy or export. Nothing is sent.
export function BriefView({ ids, items, collections, version }: BriefViewProps) {
  // Taken out of the brief, kept below the line so they can come back.
  const [left, setLeft] = useState<string[]>([]);
  const [limits, setLimits] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [view, setView] = useState<'document' | 'markdown'>('document');
  const [held, setHeld] = useState<{ id: string; needs: string }>();
  const [copied, setCopied] = useState(false);
  const written = useBrief(ids, limits, success, version);
  const brief = written.status === 'ready' ? written.brief : undefined;
  // The editors start from the lines the brief was first written with.
  const seeded = useRef(false);
  useEffect(() => {
    if (!brief || seeded.current) return;
    seeded.current = true;
    setLimits(brief.limits.join('\n'));
    setSuccess(brief.success.join('\n'));
  }, [brief]);
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(undefined), 1800);
    return () => clearTimeout(timer);
  }, [held]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const go = (inBrief: readonly string[], out: string[]) => {
    setLeft(out);
    window.location.hash = inBrief.length > 0 ? briefHash(inBrief) : briefHash([]);
  };
  const toggle = (id: string) => () => {
    const next = toggleIn(ids, left, id);
    go(next.inBrief, next.left);
  };
  const move = (id: string, step: -1 | 1) => () => {
    if (!brief) return;
    const result = reorder(brief.order, id, step);
    if ('held' in result) setHeld(result.held);
    else go(result.ids, left);
  };
  const copy = () => {
    if (!brief) return;
    void navigator.clipboard?.writeText(brief.markdown).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  const kindOf = (id: string) => {
    const item = byId.get(id);
    if (!item) return 'queued';
    const type = collections
      .find((each) => each.name === item.collection)
      ?.types.find((each) => each.name === item.type);
    return itemNodeKind(item, type, activeLease(item.lease, Date.now()) !== null);
  };
  const boards = [
    ...new Set(ids.map((id) => byId.get(id)?.collection).filter((name) => name !== undefined)),
  ];
  const order = brief?.order.filter((entry) => ids.includes(entry.id)) ?? [];
  const outIds = left.filter((id) => !ids.includes(id));
  const after = (entry: WrittenBrief['order'][number]) =>
    held?.id === entry.id
      ? t('brief.held', { id: held.needs })
      : entry.missing.length > 0
        ? t('brief.needs', { ids: listOf(entry.missing) })
        : entry.after.length > 0
          ? t('brief.after', { ids: listOf(entry.after) })
          : t('brief.now');

  if (ids.length === 0 && outIds.length === 0) {
    return (
      <div className="brief brief-blank">
        <p className="t-small">{t('brief.empty')}</p>
        <a className="quiet-link t-small" href={ITEMS_HASH}>
          {t('brief.back')}
        </a>
      </div>
    );
  }

  return (
    <div className="brief">
      <header className="brief-head">
        <a className="quiet-link t-small brief-back" href={ITEMS_HASH}>
          {t('brief.back')}
        </a>
        <span className="t-label">{t('brief.label')}</span>
        <h1 className="t-display">{t('brief.title')}</h1>
        <span className="t-small">
          {t('brief.head', { count: ids.length, boards: listOf(boards) })}
        </span>
      </header>
      <div className="brief-main">
        <div className="brief-left">
          <div className="brief-sub">
            <h2 className="t-h">{t('brief.in')}</h2>
            <span className="t-cap">{t('brief.inNote')}</span>
          </div>
          <ol className="brief-rows">
            {order.map((entry, index) => (
              <li
                key={entry.id}
                className="brief-row"
                data-held={held?.id === entry.id || undefined}
              >
                <svg
                  className="brief-node"
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  aria-hidden="true"
                >
                  <NodeMark kind={kindOf(entry.id)} cx={14} cy={14} />
                </svg>
                <a className="t-id" href={hashFor(entry.id)}>
                  {entry.id}
                </a>
                <span className="brief-tx">
                  <span className="brief-ttl">{byId.get(entry.id)?.title ?? entry.title}</span>
                  <span className="brief-after" data-warn={entry.missing.length > 0 || undefined}>
                    {after(entry)}
                  </span>
                </span>
                <span className="brief-ctl">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon
                    aria-label={t('brief.up')}
                    disabled={index === 0}
                    onClick={move(entry.id, -1)}
                  >
                    <Icon name="up" />
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    icon
                    className="brief-down"
                    aria-label={t('brief.down')}
                    disabled={index === order.length - 1}
                    onClick={move(entry.id, 1)}
                  >
                    <Icon name="up" />
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    icon
                    aria-label={t('brief.remove')}
                    onClick={toggle(entry.id)}
                  >
                    <Icon name="close" />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          {outIds.length > 0 ? (
            <>
              <div className="brief-line">
                <span className="t-label">{t('brief.out')}</span>
                <span className="t-cap">{t('brief.outNote')}</span>
              </div>
              <ol className="brief-rows" data-out="">
                {outIds.map((id) => (
                  <li key={id} className="brief-row">
                    <svg
                      className="brief-node"
                      width="28"
                      height="28"
                      viewBox="0 0 28 28"
                      aria-hidden="true"
                    >
                      <NodeMark kind={kindOf(id)} cx={14} cy={14} />
                    </svg>
                    <span className="t-id">{id}</span>
                    <span className="brief-tx">
                      <span className="brief-ttl">{byId.get(id)?.title ?? id}</span>
                    </span>
                    <span className="brief-ctl">
                      <Button size="sm" onClick={toggle(id)}>
                        {t('brief.add')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          <div className="brief-ed">
            <label>
              <span className="t-label">{t('brief.limits')}</span>
              <textarea
                className="input"
                value={limits ?? ''}
                onChange={(event) => setLimits(event.target.value)}
              />
            </label>
            <label>
              <span className="t-label">{t('brief.success')}</span>
              <textarea
                className="input"
                value={success ?? ''}
                onChange={(event) => setSuccess(event.target.value)}
              />
            </label>
          </div>
          <span className="t-small">{t('brief.editNote')}</span>
        </div>
        <section className="brief-doc raised" aria-label={t('brief.title')}>
          <div className="brief-bar">
            {/* biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, labelled as one control */}
            <span className="view-switch" role="group" aria-label={t('brief.view')}>
              <button
                type="button"
                className="view-switch-b"
                aria-pressed={view === 'document'}
                onClick={() => setView('document')}
              >
                {t('brief.document')}
              </button>
              <button
                type="button"
                className="view-switch-b"
                aria-pressed={view === 'markdown'}
                onClick={() => setView('markdown')}
              >
                {t('brief.markdown')}
              </button>
            </span>
            <span className="brief-acts">
              <Button size="sm" variant="quiet" disabled={!brief} onClick={copy}>
                {copied ? t('brief.copied') : t('brief.copy')}
              </Button>
              <Button
                size="sm"
                disabled={!brief}
                onClick={() => brief && exportFile(brief.markdown, ids)}
              >
                {t('brief.export')}
              </Button>
            </span>
          </div>
          <div className="brief-body">
            {ids.length === 0 ? (
              <p className="t-small">{t('brief.none')}</p>
            ) : written.status === 'failed' ? (
              <p className="action-error">{written.message}</p>
            ) : !brief ? (
              <p className="t-small">{t('brief.writing')}</p>
            ) : view === 'document' ? (
              <div
                className="md brief-md"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and drops dangerous links
                dangerouslySetInnerHTML={{ __html: renderMarkdown(brief.markdown) }}
              />
            ) : (
              <pre className="brief-src">{brief.markdown}</pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
