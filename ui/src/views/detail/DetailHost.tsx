import { useCallback, useLayoutEffect, useRef } from 'react';
import { fetchItem } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { listWidth, storedWidth } from '../../app/widths.ts';
import { useWorkspace, workspace } from '../../app/workspace.ts';
import { ItemDetail } from '../../components/ItemDetail.tsx';
import { NewItemForm } from '../../components/NewItemForm.tsx';
import { useRemote } from '../../hooks.ts';
import { t } from '../../i18n/i18n.ts';
import { useEscape } from '../../kit/escape.ts';
import { curView } from '../../lanes/dom.ts';
import { relayoutList } from '../../motion/relayout.ts';
import { hashOf } from '../../selection.ts';

// The item beside the list (SPEC §10.2). Foundation stub: when an item or the intake is open, the
// list narrows (relayoutList), a static divider stands at --listw, and the sheet takes all the
// rest, rendering today's ItemDetail or NewItemForm. The detail slice replaces it.

function Selected({ id }: { id: string }) {
  const app = useApp();
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  const item = useRemote(load, app.version, app.connection);
  if (item.status === 'failed') return <p className="pane-message action-error">{item.message}</p>;
  if (item.status === 'loading')
    return <p className="pane-message t-small">{t('common.loading')}</p>;
  if (!item.value) return <p className="pane-message t-small">{t('app.notFound', { id })}</p>;
  const value = item.value;
  return (
    <ItemDetail
      item={value}
      canWrite={app.session.canWrite}
      collection={app.collectionOf(value.collection)}
      collectionOf={app.collectionOf}
      onAddChild={(parent) =>
        app.newItem({
          parent: {
            id: parent.id,
            title: parent.title,
            type: parent.type,
            collection: parent.collection,
          },
        })
      }
      onClose={app.closeItem}
      itemOf={(other) => app.all.find((each) => each.id === other)}
      trayHost={null}
      canCustomize={app.session.canConfigure && !app.phone}
    />
  );
}

// Sets --listw for the room .main has now.
function placeSplit(kind: 'list' | 'table' | 'cards'): void {
  const main = document.querySelector<HTMLElement>('.main');
  if (!main) return;
  document.documentElement.style.setProperty(
    '--listw',
    `${listWidth(main.clientWidth, kind, storedWidth(kind))}px`,
  );
}

export function DetailHost() {
  const app = useApp();
  const ws = useWorkspace();
  const id = app.route.item;
  const open = !!id || !!ws.intake;
  const was = useRef(false);

  useLayoutEffect(() => {
    if (app.phone || was.current === open) return;
    was.current = open;
    const view = curView();
    const apply = () => {
      placeSplit(ws.listKind);
      view?.classList.toggle('narrow', open);
      view?.classList.toggle('chead', open);
    };
    if (view) relayoutList(view, open, apply);
    else apply();
    workspace.set({ narrow: open });
  });

  useLayoutEffect(() => {
    const onResize = () => placeSplit(ws.listKind);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ws.listKind]);

  useEscape(open && !ws.intake, 'detail', app.closeItem);
  useEscape(!!ws.intake, 'intake', () => workspace.set({ intake: null }));

  if (!open) return null;
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a separator that holds its grip and takes the keys */}
      <div
        className="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('sheet.divider')}
        aria-valuemin={340}
        aria-valuemax={1320}
        aria-valuenow={520}
        tabIndex={0}
        hidden={app.phone}
      >
        <i className="dl" />
        <i className="grip" />
      </div>
      <article
        className="sheet"
        aria-label={t('sheet.label')}
        style={app.phone ? { left: 0 } : undefined}
      >
        <div className="sheet-in">
          {ws.intake ? (
            <NewItemForm
              key={ws.intake.parent?.id ?? ws.intake.board ?? 'new'}
              connection={app.connection}
              ids={app.all.map((each) => each.id)}
              parent={ws.intake.parent}
              collection={ws.intake.board}
              onCancel={() => workspace.set({ intake: null })}
              onCreated={(created) => {
                workspace.set({ intake: null });
                window.location.hash = hashOf({ view: 'toca', item: created });
              }}
            />
          ) : id ? (
            <Selected key={id} id={id} />
          ) : null}
        </div>
      </article>
    </>
  );
}
