import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import {
  extensionOf,
  type FileDraft,
  isImage,
  MAX_FILE_MB,
  MAX_FILES,
  sizeLabel,
  tooLarge,
} from '../intake-files.ts';
import { Button, Icon } from '../kit/index.ts';
import type { EvidenceRole } from '../types.ts';

const ROLE_LABEL = {
  single: 'intake.roleSingle',
  before: 'evidence.before',
  after: 'evidence.after',
} as const;

// A picked image shows itself; anything else shows its extension.
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  const image = isImage(file.name);
  useEffect(() => {
    if (!image) return undefined;
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file, image]);
  return (
    <span className="intake-thumb" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="t-cap">{extensionOf(file.name)}</span>}
    </span>
  );
}

type IntakeFilesProps = {
  drafts: readonly FileDraft[];
  // The roles the type offers its files; one role is no choice, so none is shown.
  roles: readonly EvidenceRole[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRole: (key: string, role: EvidenceRole) => void;
  onRemove: (key: string) => void;
};

// The files the item is filed with: dropped, pasted (anywhere on the form) or picked. They are sent
// with the item and attached as its evidence in the same write.
export function IntakeFiles({
  drafts,
  roles,
  disabled,
  onAdd,
  onRole,
  onRemove,
}: IntakeFilesProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const full = drafts.length >= MAX_FILES;
  const drop = over
    ? t('intake.dropOver')
    : drafts.length > 0
      ? t('intake.dropMore')
      : t('intake.drop');
  return (
    <div className="intake-field intake-files">
      <span className="intake-label">
        <span className="t-label" id="intake-files-label">
          {t('intake.evidence')}
        </span>
        <span className="t-cap">{t('intake.optional')}</span>
      </span>
      <button
        type="button"
        className="intake-drop"
        data-over={over || undefined}
        data-slim={drafts.length > 0 || undefined}
        aria-describedby="intake-files-limits"
        disabled={disabled || full}
        onClick={() => picker.current?.click()}
        onDragOver={(event) => {
          if (disabled || full) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) onAdd([...event.dataTransfer.files]);
        }}
      >
        <Icon name="attach" />
        <span>{drop}</span>
        <span className="t-cap intake-limits" id="intake-files-limits">
          {t('intake.limits', { count: MAX_FILES, mb: MAX_FILE_MB })}
        </span>
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-labelledby="intake-files-label"
        onChange={(event) => {
          onAdd([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {drafts.length > 0 ? (
        <ul className="intake-file-list">
          {drafts.map(({ key, file, role }) => {
            const large = tooLarge(file);
            return (
              <li key={key} className="intake-file" data-error={large || undefined}>
                <Thumb file={file} />
                <span className="intake-file-name">
                  <span className="mono">{file.name}</span>
                  <span className="t-cap">
                    {large ? t('intake.tooLarge', { mb: MAX_FILE_MB }) : sizeLabel(file.size)}
                  </span>
                </span>
                {roles.length > 1 ? (
                  <fieldset className="intake-roles" disabled={disabled}>
                    <legend className="visually-hidden">
                      {t('intake.roleOf', { name: file.name })}
                    </legend>
                    {roles.map((each) => (
                      <button
                        key={each}
                        type="button"
                        className="intake-role"
                        aria-pressed={each === role}
                        onClick={() => onRole(key, each)}
                      >
                        {t(ROLE_LABEL[each])}
                      </button>
                    ))}
                  </fieldset>
                ) : (
                  <span />
                )}
                <Button
                  variant="quiet"
                  size="sm"
                  icon
                  aria-label={t('intake.removeFile', { name: file.name })}
                  disabled={disabled}
                  onClick={() => onRemove(key)}
                >
                  <Icon name="close" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
