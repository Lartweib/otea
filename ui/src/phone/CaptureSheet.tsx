import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type Ref,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { createItem, Unheard } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { boardOfCollection, boardsOf, useBoards } from '../board-studio/home/boards-store.ts';
import { t } from '../i18n/i18n.ts';
import { MAX_FILE_MB, sizeLabel, tooLarge } from '../intake-files.ts';
import { Icon } from '../kit/Icon.tsx';
import { toast } from '../kit/pop/toast.tsx';
import { captureId, QUEUE_MAX_MB, type QueuedCapture } from '../offline/capture-queue.ts';
import { enqueue, queueAvailable } from '../offline/queue-store.ts';
import { BottomSheet } from './BottomSheet.tsx';
import {
  type BoardPick,
  type CaptureBoard,
  captureBoards,
  capturePayload,
  closeCapture,
  landsStep,
  lastBoard,
  noteField,
  pickBoard,
  rememberBoard,
  useCapture,
} from './capture.ts';

// The phone's quick capture (mock screen 3): Nuevo → the title, already focused (the keyboard comes
// up with the sheet) → Guardar. The board is a chip: the one it was opened from, else the last one
// used on this phone; a tap on it lists the boards in the same sheet. A note and a photo from the
// system camera are optional; the photo is filed as evidence. Guardar creates the item, the sheet
// goes down the way it came up, and a toast under the top bar says where it went.

export type CaptureBodyProps = {
  boards: readonly CaptureBoard[];
  board: CaptureBoard | undefined;
  why: BoardPick['why'] | 'chosen';
  skipped?: string | undefined;
  picking: boolean;
  title: string;
  note: string;
  photo: { name: string; size: number; url: string; tooLarge: boolean } | null;
  posting: boolean;
  // The PC does not answer: Guardar keeps the capture in the queue, and the line says so.
  queues?: boolean;
  error?: string | undefined;
  titleRef?: Ref<HTMLInputElement>;
  photoRef?: Ref<HTMLInputElement>;
  onPick: () => void;
  onChoose: (name: string) => void;
  onTitle: (v: string) => void;
  onNote: (v: string) => void;
  onPhoto: (file: File | null) => void;
  onSave: () => void;
};

function hintOf({ why, skipped }: Pick<CaptureBodyProps, 'why' | 'skipped'>): string | null {
  if (skipped !== undefined) return t('phone.capture.skipped', { board: skipped });
  if (why === 'here') return t('phone.capture.here');
  if (why === 'last') return t('phone.capture.last');
  return null;
}

function whyNot(b: CaptureBoard): string {
  if (b.partOf !== undefined) return t('phone.capture.partOf', { board: b.partOf });
  return t('phone.capture.needs', { fields: (b.needs ?? []).join(', ') });
}

export function CaptureBody(p: CaptureBodyProps) {
  const { board, picking } = p;
  const type = board?.type;
  const hint = hintOf(p);
  const note = useRef<HTMLTextAreaElement>(null);
  const noteMissing = board?.noteNeeded !== undefined && p.note.trim() === '';
  const ready =
    !!type && p.title.trim() !== '' && !noteMissing && !p.posting && !p.photo?.tooLarge && !picking;
  // The keyboard's done key: saves, or goes on to the note the board asks for.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) p.onSave();
    else if (noteMissing && p.title.trim() !== '') note.current?.focus();
  };
  if (!board)
    return (
      <p className="cap-none" data-i="">
        {t('phone.capture.none')}
      </p>
    );
  return (
    <form className="capture-form" onSubmit={submit} noValidate>
      <div className="cap-row" data-i="">
        <button
          type="button"
          className="boardpick"
          aria-expanded={picking}
          aria-label={t('phone.capture.board', { board: board.name })}
          onClick={p.onPick}
        >
          <span className="bp-name">{board.name}</span>
          <Icon name="chevron" className="chev" />
        </button>
        {hint === null ? null : <span className="cap-why">{hint}</span>}
      </div>
      {picking ? (
        <nav className="nav cap-boards" aria-label={t('phone.capture.pick')}>
          {p.boards.map((b) => (
            <button
              key={b.name}
              type="button"
              className={b.name === board.name ? 'nrow on' : 'nrow'}
              aria-current={b.name === board.name ? 'true' : undefined}
              disabled={!b.type}
              onClick={() => p.onChoose(b.name)}
            >
              <span className="lb">{b.name}</span>
              {b.type ? (
                <span className="pair">{landsStep(b.type)}</span>
              ) : (
                <span className="why">{whyNot(b)}</span>
              )}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="cap-fields" hidden={picking}>
        <input
          ref={p.titleRef}
          className="ftitle"
          aria-label={t('phone.capture.titleField')}
          placeholder={t('phone.capture.titlePh')}
          enterKeyHint="done"
          autoComplete="off"
          value={p.title}
          onChange={(e) => p.onTitle(e.target.value)}
        />
        {type && noteField(type) !== undefined ? (
          <textarea
            ref={note}
            className="fnote"
            rows={1}
            aria-label={board.noteNeeded ?? t('phone.capture.note')}
            aria-required={board.noteNeeded !== undefined}
            placeholder={board.noteNeeded ?? t('phone.capture.note')}
            value={p.note}
            onChange={(e) => p.onNote(e.target.value)}
          />
        ) : null}
        {p.photo ? (
          <div className="cap-photo">
            <img src={p.photo.url} alt="" />
            <span className="cp-name">
              {p.photo.name}
              <small className={p.photo.tooLarge ? 'big' : undefined}>
                {p.photo.tooLarge
                  ? t('phone.capture.tooLarge', { mb: MAX_FILE_MB })
                  : sizeLabel(p.photo.size)}
              </small>
            </span>
            <button
              type="button"
              className="ibtn"
              aria-label={t('phone.capture.removePhoto')}
              onClick={() => p.onPhoto(null)}
            >
              <Icon name="x" />
            </button>
          </div>
        ) : null}
        <div className="cap-acts">
          <label className="photo">
            <input
              ref={p.photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={p.photo ? t('phone.capture.photoAgain') : t('phone.capture.photo')}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                p.onPhoto(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <Icon name="camera" className="cam" />
          </label>
          <span className="lands">
            {type && p.queues
              ? t('offline.lands', { board: board.name })
              : type
                ? t('phone.capture.lands', {
                    board: board.name,
                    step: landsStep(type, p.note.trim() !== ''),
                  })
                : null}
          </span>
          <button type="submit" className="btn primary" disabled={!ready} aria-busy={p.posting}>
            {t('phone.capture.save')}
          </button>
        </div>
        {p.error ? (
          <p className="cap-err" role="alert">
            {p.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// The keyboard's height over the page, from the visual viewport: the sheet sits on it, so Guardar
// is never under the keys. 0 without a keyboard or without the API.
export function useKeyboardInset(on: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!on || !vv) {
      setInset(0);
      return;
    }
    const read = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, [on]);
  return inset;
}

type Photo = CaptureBodyProps['photo'];

export function CaptureSheet() {
  const app = useApp();
  const cap = useCapture();
  const summaries = boardsOf(useBoards(app.version));
  const project = app.project?.id;
  const titleRef = useRef<HTMLInputElement>(null);

  // Studio boards that are always part of another never stand alone.
  const boards = useMemo(
    () =>
      captureBoards(app.collections, (name) => {
        const here = boardOfCollection(summaries, name);
        if (!here) return undefined;
        const parent = summaries.find(
          (b) => b.id !== here.id && b.definition.split?.board === here.id,
        );
        return parent?.definition.split?.always && parent.collection ? parent.name : undefined;
      }),
    [app.collections, summaries],
  );

  const [seq, setSeq] = useState(-1);
  const [chosen, setChosen] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Photo>(null);
  const file = useRef<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();
  const saved = useRef<{ board: string; id: string } | null>(null);
  // Kept for the PC (it did not answer): the toast says so instead of where it went.
  const queued = useRef<{ board: string } | null>(null);
  // The capture's own id, sent as its Idempotency-Key: Guardar pressed again, or the queue sending
  // it later, never makes a second item.
  const key = useRef('');

  // Each opening starts blank.
  if (cap.open && cap.seq !== seq) {
    setSeq(cap.seq);
    setChosen(undefined);
    setPicking(false);
    setTitle('');
    setNote('');
    setPhoto(null);
    file.current = null;
    setPosting(false);
    setError(undefined);
    key.current = captureId();
  }

  const pick = pickBoard(boards, { here: cap.o.board, last: lastBoard(project) });
  const board = chosen === undefined ? pick.board : boards.find((b) => b.name === chosen);
  const inset = useKeyboardInset(cap.open);

  // The title takes the focus as the sheet opens, in the same press that opened it, so the
  // keyboard rises with the sheet. This runs after the sheet has focused itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on each opening only
  useLayoutEffect(() => {
    if (cap.open) titleRef.current?.focus({ preventScroll: true });
  }, [cap.open, cap.seq]);

  // Off the phone, or going somewhere else, it is put away: the sheet belongs to the route.
  const place = `${app.route.view}:${'board' in app.route ? app.route.board : ''}:${app.route.item ?? ''}`;
  const placeAt = useRef(place);
  useEffect(() => {
    if (placeAt.current !== place) closeCapture();
    placeAt.current = place;
  }, [place]);
  useEffect(() => {
    if (!app.phone) closeCapture();
  }, [app.phone]);

  // The photo's thumbnail lives as long as the photo.
  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const onPhoto = (f: File | null) => {
    file.current = f;
    setPhoto(
      f ? { name: f.name, size: f.size, url: URL.createObjectURL(f), tooLarge: tooLarge(f) } : null,
    );
  };

  const onSave = async () => {
    const type = board?.type;
    if (!board || !type || posting) return;
    setPosting(true);
    setError(undefined);
    const { fields, files } = capturePayload(type, { title, note, photo: file.current });
    // The PC does not answer: the capture waits on the phone and goes when it does.
    const keep = async () => {
      const [photo] = files;
      const capture: QueuedCapture = {
        id: key.current,
        at: Date.now(),
        board: board.name,
        type: type.name,
        fields,
        ...(photo
          ? {
              photo: {
                name: photo.file.name,
                type: photo.file.type,
                bytes: await photo.file.arrayBuffer(),
                role: photo.role,
              },
            }
          : {}),
      };
      const kept = await enqueue(capture);
      if (!kept.ok) {
        setPosting(false);
        setError(
          kept.reason === 'full' ? t('offline.full', { mb: QUEUE_MAX_MB }) : t('offline.storage'),
        );
        return;
      }
      rememberBoard(project, board.name);
      queued.current = { board: board.name };
      closeCapture();
    };
    if (app.sync.offline && queueAvailable()) return keep();
    try {
      const item = await createItem(board.name, type.name, fields, undefined, files, key.current);
      rememberBoard(project, board.name);
      saved.current = { board: board.name, id: item.id };
      closeCapture();
    } catch (e) {
      if (e instanceof Unheard && queueAvailable()) return keep();
      setPosting(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!app.phone) return null;
  return (
    <BottomSheet
      open={cap.open}
      label={t('phone.newItem')}
      className="capture"
      style={{ '--kb': `${inset}px` } as CSSProperties}
      from={cap.o.from}
      onClose={closeCapture}
      onClosed={() => {
        const s = saved.current;
        const q = queued.current;
        saved.current = null;
        queued.current = null;
        if (s) toast({ msg: t('phone.capture.saved', s), at: 'top' });
        if (q) toast({ msg: t('offline.queuedToast', q), at: 'top' });
      }}
    >
      <CaptureBody
        boards={boards}
        board={board}
        why={chosen === undefined ? pick.why : 'chosen'}
        skipped={chosen === undefined ? pick.skipped : undefined}
        picking={picking}
        title={title}
        note={note}
        photo={photo}
        posting={posting}
        queues={app.sync.offline && queueAvailable()}
        error={error}
        titleRef={titleRef}
        onPick={() => setPicking((v) => !v)}
        onChoose={(name) => {
          // Back to the title in the same press, so the keyboard stays.
          flushSync(() => {
            setChosen(name);
            setPicking(false);
          });
          titleRef.current?.focus({ preventScroll: true });
        }}
        onTitle={setTitle}
        onNote={setNote}
        onPhoto={onPhoto}
        onSave={() => void onSave()}
      />
    </BottomSheet>
  );
}
