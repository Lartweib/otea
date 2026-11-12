import { useEffect, useMemo, useRef, useState } from 'react';
import { blankBoard } from '../../../../src/core/board/templates.ts';
import { useApp } from '../../app/context.tsx';
import { language, t, tx } from '../../i18n/i18n.ts';
import { Button, ChipButton } from '../../kit/Button.tsx';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { Swap } from '../../kit/Swap.tsx';
import { studioHash } from '../../selection.ts';
import { RowIcon } from '../../shell/Rail.tsx';
import { boardIcon } from '../../shell/rail-model.ts';
import { createBoard, createBoardSet, StudioRequestError, type TemplateView } from '../api.ts';
import { boardsOf, loadBoards, useBoards } from './boards-store.ts';
import { freeName, nameIssue, setBoards } from './home-model.ts';
import { MiniRoute } from './MiniRoute.tsx';
import { useTemplates } from './studio-dialogs.ts';

// Nuevo tablero (the mock's newBoardDialog): a name, what each item is called, and what it starts
// from, blank or a template, with its route. The checks are in words; a name already taken comes
// back from the server too (409). On create, the draft opens in the editor.

const BLANK = 'blank';

// `n` tells one opening from the next: each starts fresh. While it closes, the form stays.
export function NewBoardDialog({
  open,
  n,
  template,
  onClose,
}: {
  open: boolean;
  n: number;
  template: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} label={t('bs.new.title')} onClose={onClose} className="wide sh-dlg">
      <NewBoardForm key={n} start={template ?? BLANK} onClose={onClose} />
    </Dialog>
  );
}

function NewBoardForm({ start, onClose }: { start: string; onClose: () => void }) {
  const app = useApp();
  const lang = language();
  const { state: tstate } = useTemplates(lang);
  const templates = tstate.status === 'ready' ? tstate.templates : [];
  const taken = boardsOf(useBoards(app.version)).map((b) => b.name);
  const first = templates.find((x) => x.key === start);
  const [pick, setPick] = useState(start);
  const [name, setName] = useState(() => (first ? freeName(first.definition.name, taken) : ''));
  const [item, setItem] = useState(() => (first ? first.definition.item : ''));
  const [problem, setProblem] = useState('');
  const [posting, setPosting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const tpl = templates.find((x) => x.key === pick);
  const set = tpl ? setBoards(tpl) : null;
  // A template that makes several boards names each one (F13: label, route, then its name).
  const [setNames, setSetNames] = useState<Record<string, string[]>>({});
  const namesOf = (x: TemplateView): string[] =>
    setNames[x.key] ?? (setBoards(x) ?? []).map((b) => freeName(b.name, taken));
  const [badBoard, setBadBoard] = useState(-1);
  const setInputs = useRef<(HTMLInputElement | null)[]>([]);
  const blank = useMemo(() => blankBoard(lang, { name: 'blank' }), [lang]);
  const isDefault = (value: string, of: (x: TemplateView) => string) =>
    !value.trim() ||
    templates.some((x) => of(x) === value.trim() || freeName(of(x), taken) === value.trim());

  // The templates arrive after the dialog opened from one: its names fill in then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when they arrive
  useEffect(() => {
    if (!first || name || item) return;
    setName(freeName(first.definition.name, taken));
    setItem(first.definition.item);
  }, [first]);

  const choose = (key: string) => {
    setPick(key);
    const next = templates.find((x) => x.key === key);
    if (!next) return;
    if (isDefault(name, (x) => x.definition.name)) setName(freeName(next.definition.name, taken));
    if (isDefault(item, (x) => x.definition.item)) setItem(next.definition.item);
  };

  const submitSet = (x: TemplateView) => {
    const names = namesOf(x).map((n) => n.trim().replace(/\s+/g, ' '));
    const bad = names.findIndex(
      (n, k) =>
        nameIssue(n, taken) !== null ||
        names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== k,
    );
    if (bad >= 0) {
      setBadBoard(bad);
      setProblem(names[bad] ? t('bs.new.taken') : t('bs.new.emptyEach'));
      setInputs.current[bad]?.focus();
      return;
    }
    setPosting(true);
    setProblem('');
    setBadBoard(-1);
    createBoardSet({ set: x.key, lang, boards: names.map((name) => ({ name })) }).then(
      (records) => {
        loadBoards(app.version, true);
        onClose();
        const [first] = records;
        if (first) window.location.hash = studioHash({ kind: 'board', board: first.id });
        const words = { first: <b>{names[0]}</b>, second: <b>{names[1]}</b> };
        toast({ msg: tx(x.split ? 'bs.new.createdPair' : 'bs.new.createdSet', words) });
      },
      (error: unknown) => {
        setPosting(false);
        const taken409 = error instanceof StudioRequestError && error.code === 'already_exists';
        setProblem(
          taken409 ? t('bs.new.taken') : error instanceof Error ? error.message : String(error),
        );
      },
    );
  };

  const submit = () => {
    if (posting) return;
    if (tpl && set) {
      submitSet(tpl);
      return;
    }
    const clean = name.trim().replace(/\s+/g, ' ');
    const issue = nameIssue(clean, taken);
    if (issue) {
      setProblem(issue === 'empty' ? t('bs.new.empty') : t('bs.new.taken'));
      nameRef.current?.focus();
      return;
    }
    setPosting(true);
    setProblem('');
    const itemName = item.trim().replace(/\s+/g, ' ');
    createBoard({
      name: clean,
      ...(itemName ? { item: itemName } : {}),
      ...(tpl ? { template: tpl.key } : {}),
      lang,
    }).then(
      (record) => {
        loadBoards(app.version, true);
        onClose();
        window.location.hash = studioHash({ kind: 'board', board: record.id });
        toast({ msg: tx('bs.new.created', { name: <b>{clean}</b> }) });
      },
      (error: unknown) => {
        setPosting(false);
        const taken409 = error instanceof StudioRequestError && error.code === 'already_exists';
        setProblem(
          taken409 ? t('bs.new.taken') : error instanceof Error ? error.message : String(error),
        );
        nameRef.current?.focus();
      },
    );
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <h4 data-i="">{t('bs.new.title')}</h4>
      <p className="lede" data-i="">
        {t('bs.new.lede')}
      </p>
      <div data-i="" hidden={!!set}>
        <label className="flab" htmlFor="nb-name">
          {t('bs.new.name')}
        </label>
        <input
          ref={nameRef}
          id="nb-name"
          className={problem && !posting ? 'tx bad' : 'tx'}
          maxLength={40}
          placeholder={t('bs.new.namePlaceholder')}
          value={name}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setProblem('');
          }}
          onKeyDown={onEnter}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <div data-i="" hidden={!!set}>
        <label className="flab" htmlFor="nb-item">
          {t('bs.new.item')}
        </label>
        <input
          id="nb-item"
          className="tx"
          maxLength={24}
          placeholder={t('bs.new.itemPlaceholder')}
          value={item}
          autoComplete="off"
          onChange={(e) => setItem(e.target.value)}
          onKeyDown={onEnter}
        />
        <p className="fhint">{t('bs.new.itemHint')}</p>
      </div>
      <div data-i="">
        <span className="flab">{t('bs.new.starts')}</span>
        <div className="radios" role="radiogroup" aria-label={t('bs.new.starts')}>
          <ChipButton on={pick === BLANK} onClick={() => choose(BLANK)}>
            {t('bs.home.blank')}
          </ChipButton>
          {templates.map((x) => (
            <ChipButton key={x.key} on={pick === x.key} onClick={() => choose(x.key)}>
              <RowIcon icon={boardIcon(x.icon)} />
              {x.name}
              {setBoards(x) ? ` ${t('bs.new.boards', { count: setBoards(x)?.length ?? 0 })}` : ''}
            </ChipButton>
          ))}
        </div>
        <Swap k={pick} as="div" dy={3} className="nb-body">
          {tpl && set ? (
            <>
              <p className="fhint">{tpl.description}</p>
              <div className="mboards">
                {set.map((b, k) => (
                  <div className="mb" key={b.name}>
                    <label className="flab" htmlFor={`nb-set-${k}`}>
                      {t('bs.new.boardOf', {
                        label: t(k ? 'bs.new.secondBoard' : 'bs.new.firstBoard'),
                        item: b.item,
                      })}
                    </label>
                    <div>
                      <MiniRoute def={b.definition} width={220} />
                    </div>
                    <input
                      ref={(el) => {
                        setInputs.current[k] = el;
                      }}
                      id={`nb-set-${k}`}
                      className={badBoard === k && !posting ? 'tx bad' : 'tx'}
                      maxLength={40}
                      value={namesOf(tpl)[k] ?? ''}
                      autoComplete="off"
                      onChange={(e) => {
                        const next = [...namesOf(tpl)];
                        next[k] = e.target.value;
                        setSetNames({ ...setNames, [tpl.key]: next });
                        setProblem('');
                        setBadBoard(-1);
                      }}
                      onKeyDown={onEnter}
                    />
                  </div>
                ))}
              </div>
              <p className="fhint">
                {tpl.split
                  ? t('bs.new.splitHint', {
                      item: set[tpl.split.parent]?.item ?? '',
                      child: namesOf(tpl)[tpl.split.child] ?? '',
                    })
                  : t('bs.new.linkHint', {
                      first: namesOf(tpl)[0] ?? '',
                      second: namesOf(tpl)[1] ?? '',
                    })}
              </p>
            </>
          ) : (
            <>
              <div className="nb-route">
                <MiniRoute def={tpl ? tpl.definition : blank} width={260} />
              </div>
              <p className="fhint">
                {tpl
                  ? tpl.description
                  : t('bs.new.blankText', { step: blank.steps[0]?.name ?? '' })}
              </p>
            </>
          )}
        </Swap>
      </div>
      <p className="dhint" role="alert">
        {problem}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={submit} disabled={posting}>
          {posting ? t('bs.new.creating') : set ? t('bs.new.createAll') : t('bs.new.create')}
        </Button>
      </div>
    </>
  );
}
