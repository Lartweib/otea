import { t } from '../i18n/i18n.ts';
import { lookGlyph } from '../lanes/looks.ts';
import { namedSteps, ROUTE_H, type RouteStep, RY, routeOf } from './route.ts';

// A template's way of working at a glance (route.ts): its steps' names above, the lanes laid flat,
// one walked line through every step, each step a small node of whose turn it is.
export function TemplateRoute({ steps, width = 320 }: { steps: RouteStep[]; width?: number }) {
  if (steps.length === 0) return null;
  const r = routeOf(steps, width);
  // Names that would touch give way; the whole route stays in the label.
  const shown = namedSteps(
    r.xs,
    steps.map(({ label }) => label),
    steps.map(({ lane }) => lane === 'you'),
  );
  const named = (i: number) => shown[i] === true;
  const last = steps.length - 1;
  return (
    <svg
      className="st-route"
      width={width}
      height={ROUTE_H}
      viewBox={`0 0 ${width} ${ROUTE_H}`}
      role="img"
      aria-label={t('studio.start.route', { steps: steps.map(({ label }) => label).join(' → ') })}
    >
      <g className="st-rlab">
        {steps.map((step, i) =>
          named(i) ? (
            <text
              key={step.name}
              x={r.xs[i]}
              y={9}
              textAnchor={i === last && last > 0 ? 'end' : i === 0 ? 'start' : 'middle'}
              dx={i === 0 ? -((r.xs[0] ?? 0) - 18) : i === last && last > 0 ? 4 : 0}
              className={step.lane === 'you' ? 'you' : undefined}
            >
              {step.label}
            </text>
          ) : null,
        )}
      </g>
      <text className="st-rlh" x={0} y={RY.ag + 3.5}>
        {t('lanes.agents')}
      </text>
      <text className="st-rlh you" x={0} y={RY.you + 3.5}>
        {t('lanes.you')}
      </text>
      <path className="st-rl ag" d={r.ag} />
      <path className="st-rl you" d={r.you} />
      {r.trunk ? <path className="st-rl none" d={r.trunk} /> : null}
      <path className="st-rw" d={r.walked} />
      {steps.map((step, i) => {
        const [x, y] = r.stops[i] ?? [0, 0];
        return (
          <g
            key={step.name}
            className="st-rstop"
            transform={`translate(${x} ${y}) scale(0.78)`}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the node glyphs are fixed markup
            dangerouslySetInnerHTML={{
              __html: lookGlyph(
                step.lane === 'you' ? 'yours' : step.lane === 'none' ? 'done' : 'queued',
              ),
            }}
          />
        );
      })}
    </svg>
  );
}
