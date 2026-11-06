import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/schibsted-grotesk/400.css';
import '@fontsource/schibsted-grotesk/500.css';
import '@fontsource/schibsted-grotesk/600.css';
import '@fontsource/schibsted-grotesk/700.css';
import '@fontsource/spline-sans-mono/400.css';
import '@fontsource/spline-sans-mono/500.css';
import '@fontsource/spline-sans-mono/600.css';
import { App } from './App.tsx';
import { PairScreen } from './components/PairScreen.tsx';
import { startLanguage } from './i18n/i18n.ts';
import './styles/tokens.css';
import './styles/base.css';
import './kit/kit.css';
import './icons/icons.css';
import './styles/shell.css';
import './styles/list.css';
import './styles/grid.css';
import './styles/detail.css';
import './styles/evidence.css';
import './styles/workspace.css';
import './styles/empty.css';
import './styles/modules.css';
import './styles/relations.css';
import './styles/phone.css';
import './styles/triage.css';
import './styles/brief.css';
import './styles/studio.css';
import './styles/studio-preview.css';
import './styles/customize.css';
import './styles/activity.css';
import './styles/language.css';
import './styles/pairing.css';
import './styles/projects.css';
import './styles/rounds.css';
import './styles/compare.css';
import { applyChoice, loadChoice } from './theme-dom.ts';

applyChoice(loadChoice());
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
