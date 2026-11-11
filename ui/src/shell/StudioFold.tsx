import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../app/context.tsx';
import { StudioTreeView, studioTreeOf } from '../components/StudioTree.tsx';
import { MODULES } from '../modules/registry.ts';
import { Choreo, part } from '../motion/choreo.ts';
import { useStudioIndex } from '../studio/use-studio-index.ts';

// Under Studio, while Studio (or the module catalog) is open: its blueprint, presets and modules.
// The tree unfolds as a gesture: the room opens (grid rows 0fr → 1fr, 440 settle) while its rows
// resolve one by one; leaving Studio folds it as the same gesture mirrored, then it goes.
export function StudioFold({ open }: { open: boolean }) {
  const app = useApp();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const index = useStudioIndex(mounted, app.version + app.studioWrites, app.connection);
  const box = useRef<HTMLDivElement>(null);
  const choreo = useRef<Choreo | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (open) {
      if (!choreo.current) {
        const rows = [...el.querySelectorAll('.rail-tree > *')];
        choreo.current = new Choreo([
          part(el, { gridTemplateRows: '0fr' }, { gridTemplateRows: '1fr' }, 440, 'settle', 0),
          ...rows.flatMap((x, i) => {
            const d = 60 + 34 * Math.min(i, 5);
            return [
              part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
              part(
                x,
                { transform: 'translateY(-4px)' },
                { transform: 'translateY(0px)' },
                380,
                'glide',
                d,
              ),
            ];
          }),
        ]);
      }
      choreo.current.go(1);
    } else if (choreo.current) {
      const ch = choreo.current;
      ch.go(0).then((latest) => {
        if (latest && ch.dir === 0) {
          choreo.current = null;
          setMounted(false);
        }
      });
    }
  }, [open, mounted]);

  if (!mounted) return null;
  const presets = index.presets.status === 'ready' ? index.presets.value : [];
  const blueprint = index.blueprint.status === 'ready' ? index.blueprint.value.blueprint : null;
  const tree = studioTreeOf({ presets, blueprint, modules: MODULES.length, route: app.route });
  return (
    <div className="rail-fold" ref={box}>
      <div className="rail-fold-in">
        <StudioTreeView tree={tree} />
      </div>
    </div>
  );
}
