import { isEvidence, LEVELS, type Part } from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { SeverityBars } from '../../kit/Marks.tsx';
import { sampleValue } from './samples.ts';

// A part's sample value as the item page shows it, per kind: prose, chips, a checklist, level bars,
// figures for images and video, a diff, a log. `empty`: handed off in this step and not there yet.

const WAVES = [
  'M0 34C40 30 80 44 120 38S200 26 240 32',
  'M0 22C50 30 90 18 140 26S210 36 240 28',
  'M0 40C30 36 70 30 110 34S190 42 240 36',
];

const BARS = Array.from({ length: 60 }, (_, k) => ({
  x: 5 + k * 4.9,
  h: 6 + Math.abs(Math.sin(k * 0.7) * 26) + (k % 5),
}));

function Figure({ k, cap, play = false }: { k: number; cap?: string; play?: boolean }) {
  return (
    <figure>
      <svg className="bsp-fig" viewBox="0 0 240 150" aria-hidden="true">
        <rect width="240" height="150" fill="var(--fig)" />
        <g fill="none" stroke="var(--fig-line)" strokeWidth=".8">
          <path d={WAVES[k % 3]} />
          <path d={WAVES[(k + 1) % 3]} transform="translate(0 46)" />
          <path d={WAVES[(k + 2) % 3]} transform="translate(0 84)" />
        </g>
        {play ? (
          <>
            <circle cx="120" cy="75" r="18" fill="var(--sheet)" stroke="var(--ink-3)" />
            <path d="M114 66v18l14-9z" fill="var(--ink-2)" />
            <path d="M14 136H226" stroke="var(--rule-2)" />
            <path d="M14 136H90" stroke="var(--ink-2)" />
          </>
        ) : (
          <>
            <ellipse cx={100 + k * 18} cy="88" rx="34" ry="20" fill="none" stroke="var(--ink-2)" />
            <path d={`M${80 + k * 18} 72c10-14 30-14 40 0`} fill="none" stroke="var(--ink-3)" />
          </>
        )}
      </svg>
      {cap ? <figcaption className="bsp-cap">{cap}</figcaption> : null}
    </figure>
  );
}

export function PartValue({ part, empty = false }: { part: Part; empty?: boolean }) {
  if (empty)
    return (
      <p className="bsp-val empty">
        {t(isEvidence(part) ? 'bs.preview.empty.evidence' : 'bs.preview.empty.field')}
      </p>
    );
  const seed = part.name.length;
  switch (part.kind) {
    case 'text':
    case 'long':
      // A long text shown as options side by side (show: options): each "### A · Name" its column.
      if (part.show === 'options')
        return (
          <div className="bsp-optcols">
            <div>
              <b>{t('bs.preview.value.optionA')}</b>
              <p>{t('bs.preview.value.optionAText')}</p>
            </div>
            <div>
              <b>{t('bs.preview.value.optionB')}</b>
              <p>{t('bs.preview.value.optionBText')}</p>
            </div>
          </div>
        );
      return <p className="bsp-val">{sampleValue(part, seed)}</p>;
    case 'date':
    case 'yesno':
      return <p className="bsp-val">{sampleValue(part, seed)}</p>;
    case 'number':
    case 'url':
    case 'branch':
      return <p className="bsp-val mono">{sampleValue(part, seed)}</p>;
    case 'check':
      return (
        <div className="bsp-val">
          <div className="bsp-ckl">
            {part.options.map((option, i) => (
              <span key={option.id}>
                <i className={i < part.options.length - 1 ? 'on' : undefined} />
                {option.name}
              </span>
            ))}
          </div>
        </div>
      );
    case 'choice':
    case 'multi':
      return (
        <div className="bsp-val">
          <span className="bsp-chipv">{sampleValue(part, seed)}</span>
        </div>
      );
    case 'level':
      return (
        <div className="bsp-val bsp-level">
          <SeverityBars level={seed % LEVELS.length} />
          {sampleValue(part, seed)}
        </div>
      );
    case 'images':
      if (part.show === 'one')
        return (
          <div className="bsp-figs one">
            <Figure k={0} />
          </div>
        );
      if (part.show === 'ba')
        return (
          <div className="bsp-figs two">
            <Figure k={0} cap={t('bs.preview.value.before')} />
            <Figure k={1} cap={t('bs.preview.value.after')} />
          </div>
        );
      return (
        <div className="bsp-figs">
          <Figure k={0} />
          <Figure k={1} />
          <Figure k={2} />
        </div>
      );
    case 'video':
      if (part.show === 'player')
        return (
          <div className="bsp-figs one">
            <Figure k={0} play />
          </div>
        );
      return (
        <div className="bsp-figs">
          <Figure k={0} cap="0.0 s" />
          <Figure k={1} cap="1.2 s" />
          <Figure k={2} cap="2.4 s" />
        </div>
      );
    case 'audio':
      return (
        <svg className="bsp-fig" viewBox="0 0 300 44" aria-hidden="true">
          <rect width="300" height="44" fill="var(--fig)" />
          {BARS.map(({ x, h }) => (
            <rect key={x} x={x} y={22 - h / 2} width="2.4" height={h} rx="1" fill="var(--ink-3)" />
          ))}
        </svg>
      );
    case 'code':
      return (
        <div className="bsp-code">
          <div>@@ src/example.ts</div>
          <div className="m">- const ready = false</div>
          <div className="p">+ const ready = await check()</div>
          <div className="p">+ if (!ready) return</div>
        </div>
      );
    case 'log':
      return (
        <div className="bsp-code">
          <div>12:04:11 loading</div>
          <div>12:04:12 2 checks passed</div>
          <div className="m">12:04:12 warning: 1 check skipped</div>
        </div>
      );
    case 'diagram':
      return (
        <svg className="bsp-fig" viewBox="0 0 300 90" aria-hidden="true">
          <rect width="300" height="90" fill="var(--fig)" />
          <g fill="var(--sheet)" stroke="var(--ink-3)">
            <rect x="14" y="14" width="80" height="28" rx="5" />
            <rect x="206" y="14" width="80" height="28" rx="5" />
            <rect x="110" y="52" width="80" height="28" rx="5" />
          </g>
          <path d="M94 28H206M54 42V66H110M246 42V66H190" fill="none" stroke="var(--ink-3)" />
        </svg>
      );
    default:
      return <span className="bsp-file">example-0.12.zip</span>;
  }
}
