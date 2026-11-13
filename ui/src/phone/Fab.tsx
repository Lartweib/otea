import { type Ref, useRef } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace, type Workspace } from '../app/workspace.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import type { Route } from '../selection.ts';
import { openCapture } from './capture.ts';
import { useRise } from './rise.ts';

// The phone's Nuevo ítem (SPEC §10.7, mock:936, 954): a 48 px ink round with a + at the bottom
// right, the sheet button's twin on the left, on the lists only (Te toca, Atasco, a board). On a
// board it creates there. It opens the quick capture (CaptureSheet), which grows out of it. It
// rises in with the list and sinks away, mirrored (rise.ts).

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
    <button
      type="button"
      className="fab"
      aria-label={t('phone.newItem')}
      ref={ref}
      onClick={onPress}
    >
      <Icon name="plus" />
    </button>
  );
}

export function Fab() {
  const app = useApp();
  const ws = useWorkspace();
  const target = app.phone ? fabFor(app.route, ws) : null;
  const last = useRef(target);
  if (target) last.current = target;
  const { mounted, ref } = useRise<HTMLButtonElement>(target !== null);
  if (!mounted) return null;
  return (
    <FabButton
      ref={ref}
      onPress={() =>
        openCapture({ board: last.current?.board, from: () => document.querySelector('.fab') })
      }
    />
  );
}
