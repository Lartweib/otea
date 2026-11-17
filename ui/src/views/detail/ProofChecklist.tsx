import { t } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/Icon.tsx';
import {
  type ProofChecklistView,
  type ProofPoint,
  pointState,
  proofCount,
  proofLabel,
} from './proof-checklist.ts';

// A checklist that asks for proof: each point with its tick and, at its right, its proof as a chip
// (the file, the log line, the passing test) that opens the reader on it; a point ticked without
// proof shows a dashed gap. The footer counts what is ticked and proved and, while the step being
// done still needs the checklist (`short`, as the engine finds it), how many points are left. An
// optional checklist is never shown as lacking (DR3-10).
export function ProofChecklist({
  list,
  short = false,
  onRead,
}: {
  list: ProofChecklistView;
  short?: boolean;
  onRead?: ((evidence: number, line?: number) => void) | undefined;
}) {
  const count = proofCount(list);
  const missing = short ? count.total - count.proved : 0;
  return (
    <section className="isec proof-list" data-key={`isec:proof:${list.part}`}>
      <div className="ch">
        <span className="margin-label">{list.name}</span>
        <span className="gloss">{t('proof.asks')}</span>
      </div>
      <ul className="proof-points">
        {list.points.map((point) => (
          <Point key={point.id} point={point} short={short} onRead={onRead} />
        ))}
      </ul>
      <p className={`proof-foot${missing ? ' short' : ''}`}>
        {t('proof.count', {
          ticked: count.ticked,
          proved: count.proved,
          total: count.total,
        })}
        {missing ? ` · ${t('proof.missing', { count: missing })}` : ''}
      </p>
    </section>
  );
}

function Point({
  point,
  short,
  onRead,
}: {
  point: ProofPoint;
  short: boolean;
  onRead?: ((evidence: number, line?: number) => void) | undefined;
}) {
  const state = pointState(point);
  const { proof } = point;
  return (
    <li className={`proof-point ${state}`}>
      <span className="proof-box" aria-hidden="true">
        {point.ticked ? <Icon name="check" /> : null}
      </span>
      <span className="proof-name">
        <span className="visually-hidden">
          {point.ticked ? t('proof.ticked') : t('proof.unticked')}:{' '}
        </span>
        {point.name}
      </span>
      {proof ? (
        <button
          type="button"
          className={`proof-chip ${proof.kind}`}
          disabled={!onRead}
          onClick={() => onRead?.(proof.evidence, proof.line)}
          title={proof.text ?? proofLabel(proof)}
          aria-label={t(`proof.open.${proof.kind}`, {
            what: proofLabel(proof),
          })}
        >
          <Icon name={proof.kind === 'test' ? 'done' : proof.kind === 'log' ? 'log' : 'image'} />
          <span className="proof-what">{proofLabel(proof)}</span>
          {proof.kind === 'log' && proof.text ? (
            <span className="proof-line">{proof.text}</span>
          ) : null}
        </button>
      ) : (
        <span className="proof-gap">
          {state === 'unproved'
            ? t('proof.none')
            : short
              ? t('proof.untickedShort')
              : t('proof.unticked')}
        </span>
      )}
    </li>
  );
}
