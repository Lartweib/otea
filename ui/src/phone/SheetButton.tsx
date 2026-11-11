import type { Ref } from 'react';
import { useApp } from '../app/context.tsx';
import { useWorkspace, type Workspace } from '../app/workspace.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/Icon.tsx';
import type { Route } from '../selection.ts';
import { navSheet, useNavSheet } from './nav.ts';
import { useRise } from './rise.ts';

// The phone's sheet button (SPEC §10.7): a 48 px round at the bottom left, under the thumb, the
// + Nuevo ítem's twin. Its icon is a sheet risen from the screen's foot; it opens the nav sheet,
// which rises out of it. It is on every page of the project, and goes, mirrored, while an item,
// the new item page or the activity drawer takes the screen.

export function sheetButtonFor(route: Route, ws: Pick<Workspace, 'intake' | 'activity'>): boolean {
  return !(route.item || ws.intake || ws.activity);
}

type ViewProps = { open: boolean; onPress: () => void; ref?: Ref<HTMLButtonElement> };

export function SheetButtonView({ open, onPress, ref }: ViewProps) {
  return (
    <button
      type="button"
      className="sheetbtn"
      aria-label={t('phone.openNav')}
      aria-haspopup="dialog"
      aria-expanded={open}
      ref={ref}
      onClick={onPress}
    >
      <Icon name="sheet" />
    </button>
  );
}

export function SheetButton() {
  const app = useApp();
  const ws = useWorkspace();
  const open = useNavSheet();
  const show = app.phone && sheetButtonFor(app.route, ws);
  const { mounted, ref } = useRise<HTMLButtonElement>(show);
  if (!mounted) return null;
  return <SheetButtonView ref={ref} open={open} onPress={navSheet.toggle} />;
}
