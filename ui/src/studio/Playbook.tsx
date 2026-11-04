import { useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../kit/index.ts';
import { setIn } from './draft.ts';

// The playbooks of a preset, opened from the index: the preset's and each type's, edited as text in
// the draft, with + to give the preset or the type one of its own.

type PlaybookProps = {
  files: Array<{ path: string; owner: string | undefined }>;
  playbooks: Record<string, string>;
  type: string | undefined;
  yaml: string;
  change: ((next: string) => void) | undefined;
  setPlaybook: ((path: string, text: string) => void) | undefined;
  setDraftAll: ((yaml: string, path: string) => void) | undefined;
};

export function PlaybookSection({
  files,
  playbooks,
  type,
  yaml,
  setPlaybook,
  setDraftAll,
}: PlaybookProps) {
  const [chosen, setChosen] = useState(files[0]?.path);
  const path = files.some((file) => file.path === chosen) ? chosen : files[0]?.path;
  const text = path === undefined ? undefined : playbooks[path];
  const parts = (text ?? '')
    .split('\n')
    .filter((line) => /^##\s/.test(line))
    .map((line) => line.replace(/^##\s+/, ''));
  const typeHasOwn = type !== undefined && files.some(({ owner }) => owner === type);
  const presetHasOwn = files.some(({ owner }) => owner === undefined);
  return (
    <section className="st-sec">
      <div className="st-sh">
        <h2 className="t-h">{t('studio.section.playbook')}</h2>
        <span className="t-cap">{t('studio.playbook.note')}</span>
      </div>
      <div className="st-pb">
        <div className="st-pbl">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              aria-current={file.path === path ? 'true' : undefined}
              onClick={() => setChosen(file.path)}
            >
              <span>{file.owner === undefined ? t('studio.playbook.everyType') : file.owner}</span>
              <code className="t-cap">{file.path}</code>
            </button>
          ))}
          {setDraftAll && !presetHasOwn ? (
            <button
              type="button"
              className="btn sm quiet"
              onClick={() =>
                setDraftAll(setIn(yaml, ['playbook'], './playbook.md'), './playbook.md')
              }
            >
              <Icon name="plus" />
              {t('studio.playbook.addShared')}
            </button>
          ) : null}
          {setDraftAll && type !== undefined && !typeHasOwn ? (
            <button
              type="button"
              className="btn sm quiet"
              onClick={() =>
                setDraftAll(
                  setIn(yaml, ['types', type, 'playbook'], `./playbook/${type}.md`),
                  `./playbook/${type}.md`,
                )
              }
            >
              <Icon name="plus" />
              {t('studio.playbook.addFor', { type })}
            </button>
          ) : null}
          {parts.length > 0 ? (
            <div className="st-parts">
              <span className="t-label">{t('studio.playbook.parts')}</span>
              {parts.map((part) => (
                <span key={part} className="t-small">
                  {part}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="st-pbe">
          {path === undefined ? (
            <p className="t-small">{t('studio.playbook.none')}</p>
          ) : (
            <textarea
              className="st-md"
              value={text ?? ''}
              readOnly={setPlaybook === undefined}
              spellCheck={false}
              aria-label={t('studio.playbook.edit', { path })}
              onChange={(event) => setPlaybook?.(path, event.target.value)}
            />
          )}
          <p className="t-cap">{t('studio.playbook.order')}</p>
        </div>
      </div>
    </section>
  );
}
