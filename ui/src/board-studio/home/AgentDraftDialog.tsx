import { useRef, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { language, t, tx } from '../../i18n/i18n.ts';
import { Button, ChipButton } from '../../kit/Button.tsx';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { studioHash } from '../../selection.ts';
import { requestAgentDraft } from '../api.ts';
import { whoName } from '../words.ts';
import { loadBoards } from './boards-store.ts';
import { nameIssue } from './home-model.ts';
import { rememberDrafter } from './studio-dialogs.ts';

// Que lo esboce un agente (the mock's agentDraftDialog): the board's name, what you need and who
// drafts it. It creates a Pedido and a board waiting for the draft; Studio's home shows it waiting,
// and offers to open it when the draft arrives. A refusal comes back in the server's words.

const ANY = '';

// `name`: what Nuevo tablero had typed, when it handed over.
export function AgentDraftDialog({
  open,
  n,
  name = '',
  onClose,
}: {
  open: boolean;
  n: number;
  name?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} label={t('bs.ask.title')} onClose={onClose} size="md" className="sh-dlg">
      <AgentDraftForm key={n} start={name} onClose={onClose} />
    </Dialog>
  );
}

function AgentDraftForm({ start, onClose }: { start: string; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState(start);
  const [need, setNeed] = useState('');
  const [who, setWho] = useState(ANY);
  const [problem, setProblem] = useState('');
  const [posting, setPosting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // The same agents the editor's step menus offer: every agent Otea has seen.
  const agents = (app.agents ?? []).map((a) => a.name);

  const submit = () => {
    if (posting) return;
    const clean = name.trim().replace(/\s+/g, ' ');
    if (nameIssue(clean, []) === 'empty') {
      setProblem(t('bs.new.empty'));
      nameRef.current?.focus();
      return;
    }
    setPosting(true);
    setProblem('');
    const agent = who === ANY ? null : who;
    requestAgentDraft({ name: clean, need: need.trim(), agent, lang: language() }).then(
      ({ board, item }) => {
        rememberDrafter(board.id, agent);
        loadBoards(app.version, true);
        onClose();
        if (app.route.view !== 'studio') window.location.hash = studioHash();
        toast({ msg: tx('bs.ask.sent', { id: <b>{item}</b>, name: <b>{clean}</b> }) });
      },
      (error: unknown) => {
        setPosting(false);
        setProblem(error instanceof Error ? error.message : String(error));
      },
    );
  };

  return (
    <>
      <h4 data-i="">{t('bs.ask.title')}</h4>
      <p className="lede" data-i="">
        {t('bs.ask.lede')}
      </p>
      <div data-i="">
        <label className="flab" htmlFor="ad-name">
          {t('bs.new.name')}
        </label>
        <input
          ref={nameRef}
          id="ad-name"
          className={problem && !name.trim() ? 'tx bad' : 'tx'}
          maxLength={40}
          placeholder={t('bs.ask.namePlaceholder')}
          value={name}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setProblem('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div data-i="">
        <label className="flab" htmlFor="ad-need">
          {t('bs.ask.need')}
        </label>
        <textarea
          id="ad-need"
          rows={3}
          placeholder={t('bs.ask.needPlaceholder')}
          value={need}
          onChange={(e) => setNeed(e.target.value)}
        />
      </div>
      <div data-i="">
        <span className="flab">{t('bs.ask.who')}</span>
        <div className="radios" role="radiogroup" aria-label={t('bs.ask.who')}>
          <ChipButton on={who === ANY} onClick={() => setWho(ANY)}>
            {whoName('any')}
          </ChipButton>
          {agents.map((a) => (
            <ChipButton key={a} on={who === a} onClick={() => setWho(a)}>
              {a}
            </ChipButton>
          ))}
        </div>
      </div>
      <p className="dhint" role="alert">
        {problem}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={submit} disabled={posting}>
          {posting ? t('bs.ask.sending') : t('bs.ask.send')}
        </Button>
      </div>
    </>
  );
}
