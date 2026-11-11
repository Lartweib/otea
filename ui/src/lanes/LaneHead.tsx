import { t } from '../i18n/i18n.ts';

// The lanes' names over a list (mock:1479): ag at 16.5, tú/you at 40.5 in your ink.
export function LaneHead({ className }: { className?: string }) {
  return (
    <div
      className={className ? `lane-head ${className}` : 'lane-head'}
      aria-hidden="true"
      data-leaf=""
      data-enter="fade"
    >
      <span className="ag">{t('lanes.agents')}</span>
      <span className="you">{t('lanes.you')}</span>
    </div>
  );
}
