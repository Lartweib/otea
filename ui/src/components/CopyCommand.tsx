import { useState } from 'react';
import { t } from '../i18n/i18n.ts';

// A command to run in a terminal, as text with a button that copies it: never a button that runs it.
export function CopyCommand({ command, small = false }: { command: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <span className="pj-cmd" data-size={small ? 'sm' : undefined}>
      <span className="pj-prompt" aria-hidden="true">
        $
      </span>
      <code>{command}</code>
      <button
        type="button"
        className="pj-copy"
        data-tip={copied ? t('settings.copied') : t('settings.copyCommand')}
        aria-label={t('settings.copyCommand')}
        onClick={copy}
      >
        <CopyGlyph />
      </button>
    </span>
  );
}

export function CopyGlyph() {
  return (
    <svg className="pj-copy-glyph" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.5" />
      <path d="M10.75 5.25 V4.5 A1.25 1.25 0 0 0 9.5 3.25 H4.5 A1.25 1.25 0 0 0 3.25 4.5 V9.5 A1.25 1.25 0 0 0 4.5 10.75 H5.25" />
    </svg>
  );
}
