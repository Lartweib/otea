import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import { App } from './App.tsx';
import { PairScreen } from './components/PairScreen.tsx';
import { startLanguage } from './i18n/i18n.ts';
import { applyMotionPref } from './motion/reduced.ts';
// Every stylesheet, in the order of SPEC §11: the foundation's, then each slice's.
import './styles/tokens.css';
import './styles/tokens-legacy.css';
import './styles/base.css';
import './kit/kit.css';
import './icons/icons.css';
import './styles/frame.css';
import './styles/lanes.css';
import './styles/pops.css';
import './styles/shell.css';
import './styles/rail.css';
import './styles/prefs.css';
import './styles/language.css';
import './styles/toca.css';
import './styles/agents.css';
import './styles/board.css';
import './styles/pasos.css';
import './styles/table.css';
import './styles/tray.css';
import './styles/sheet.css';
import './styles/detail.css';
import './styles/board-item.css';
import './styles/route.css';
import './styles/evidence.css';
import './styles/relations.css';
import './styles/modules.css';
import './styles/rounds.css';
import './styles/notes.css';
import './styles/compare.css';
import './styles/triage.css';
import './styles/activity.css';
import './styles/intake.css';
import './styles/projects.css';
import './styles/performance.css';
import './styles/pairing.css';
import './styles/brief.css';
import './styles/empty.css';
import './styles/studio.css';
import './styles/studio-preview.css';
import './styles/studio-home.css';
import './styles/phone.css';
import './styles/studio-editor.css';
import './styles/studio-pair.css';
import { applyChoice, loadChoice } from './theme-dom.ts';

applyChoice(loadChoice());
applyMotionPref();
startLanguage();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* A phone on the LAN that has not paired yet is only served this screen. */}
      {window.location.pathname === '/pair' ? <PairScreen /> : <App />}
    </StrictMode>,
  );
}
