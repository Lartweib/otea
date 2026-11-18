import { roleWord } from '../../evidence.ts';
import { t } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import type { Evidence } from '../../types.ts';
import { EvidenceReader, type ReaderDecide, type ReaderNote } from './EvidenceViewer.tsx';
import type { ReaderPick } from './reader-pick.ts';

// A file of the round against the round before it.
export type FileMark = 'new' | 'changed' | 'same';

const MARK_KEY = {
  new: 'phone.r.new',
  changed: 'phone.r.changedFile',
  same: 'phone.r.same',
} as const;

type PaneProps = {
  evidence: readonly Evidence[];
  at: number;
  onAt: (at: number) => void;
  // The board part each file went to, by module id; a file without one reads by its kind.
  parts?: ReadonlyMap<string, string> | undefined;
  marks?: ReadonlyMap<number, FileMark> | undefined;
  // How many of the person's notes each file holds, by evidence id (DR3-14).
  noted?: ReadonlyMap<number, number> | undefined;
  // The files opened in the reader, by evidence id.
  seen: ReadonlySet<number>;
  decide?: ReaderDecide | undefined;
  note?: ReaderNote | undefined;
  start?: ReaderPick | undefined;
};

// The desk reader's page (the review mock, desk): the round's files listed on the left, each with
// its part, how it compares with the round before and whether you opened it; the one picked read on
// the right in the viewer for its kind, the others a step away ("3 of 7").
export function ReaderPane({
  evidence,
  at,
  onAt,
  parts,
  marks,
  noted,
  seen,
  decide,
  note,
  start,
}: PaneProps) {
  return (
    <div className="rd-pane">
      <nav className="rd-list" aria-label={t('evidence.reader.files')}>
        {evidence.map((e, i) => {
          const mark = marks?.get(e.id);
          const part = e.module === null ? undefined : parts?.get(e.module);
          const side = roleWord(e);
          const notes = noted?.get(e.id) ?? 0;
          return (
            <button
              key={e.id}
              type="button"
              className="rd-file"
              aria-current={i === at ? 'true' : undefined}
              data-seen={seen.has(e.id) ? 'true' : undefined}
              onClick={() => onAt(i)}
            >
              <span className="rd-fn">{e.filename}</span>
              <span className="rd-kd">
                {part ?? t(`evidence.kind.${e.kind}`)}
                {side ? ` · ${side}` : ''}
                {notes ? (
                  <span className="rd-notes">{t('notes.count', { count: notes })}</span>
                ) : null}
              </span>
              {mark ? <span className={`mk ${mark}`}>{t(MARK_KEY[mark])}</span> : null}
              {seen.has(e.id) ? (
                <span className="rd-seen" role="img" aria-label={t('evidence.reader.opened')} />
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="rd-main">
        <EvidenceReader
          evidence={evidence}
          at={at}
          onAt={onAt}
          decide={decide}
          note={note}
          start={start}
        />
      </div>
    </div>
  );
}

// The reader on the desk: the whole round in one dialog, opened from the evidence; Close leaves
// the way it came.
export function DeskReader({
  open,
  onClose,
  ...pane
}: PaneProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      label={t('evidence.reader.title')}
      onClose={onClose}
      size="lg"
      className="rd-dialog"
    >
      <div className="rd-head" data-i>
        <span className="rd-title">{t('evidence.reader.title')}</span>
        <button type="button" className="btn quiet" onClick={onClose}>
          {t('evidence.reader.close')}
        </button>
      </div>
      <div data-i>
        <ReaderPane {...pane} />
      </div>
    </Dialog>
  );
}
