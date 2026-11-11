import { type Ref, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace, type Workspace } from '../app/workspace.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import { Choreo, part } from '../motion/choreo.ts';
import type { Route } from '../selection.ts';

// The phone's + Nuevo ítem (SPEC §10.7, mock:936, 954): a 48 px ink pill at the bottom right, on
// the lists only (Te toca, Atasco, a board). On a board it creates there. It rises in as a list
// comes and sinks away, mirrored, when an item, the new item page, the activity drawer or another
// view takes the screen.

export function fabFor(
  route: Route,
  ws: Pick<Workspace, 'intake' | 'activity'>,
): { board?: string } | null {
  if (route.item || ws.intake || ws.activity) return null;
  if (route.view === 'board') return { board: route.board };
  if (route.view === 'toca' || route.view === 'atasco') return {};
  return null;
}

export function FabButton({ onPress, ref }: { onPress: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button type="button" className="fab" ref={ref} onClick={onPress}>
      <Icon name="plus" />
      {t('phone.newItem')}
    </button>
  );
}

export function Fab() {
  const app = useApp();
  const ws = useWorkspace();
  const target = app.phone ? fabFor(app.route, ws) : null;
  const show = target !== null;
  const [mounted, setMounted] = useState(show);
  const el = useRef<HTMLButtonElement>(null);
  const choreo = useRef<Choreo | null>(null);
  const last = useRef(target);
  if (target) last.current = target;
  if (show && !mounted) setMounted(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on show, hide and mount
  useLayoutEffect(() => {
    const b = el.current;
    if (!b) return;
    if (!choreo.current)
      choreo.current = new Choreo([
        part(b, { opacity: 0 }, { opacity: 1 }, 240, 'drift', 0),
        part(
          b,
          { transform: 'translateY(14px) scale(0.96)' },
          { transform: 'translateY(0px) scale(1)' },
          440,
          'settle',
          0,
        ),
      ]);
    const ch = choreo.current;
    if (show) ch.go(1);
    else
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
        }
      });
  }, [show, mounted]);

  if (!mounted) return null;
  return <FabButton ref={el} onPress={() => app.newItem(last.current ?? undefined)} />;
}
