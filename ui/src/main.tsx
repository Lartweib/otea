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
import './styles/tokens.css';
import './styles/base.css';
import './kit/kit.css';
import './styles/shell.css';
import './styles/list.css';
import './styles/detail.css';
import './styles/evidence.css';
import './styles/workspace.css';
import './styles/modules.css';
import './styles/phone.css';
import './styles/triage.css';
import { applyChoice, loadChoice } from './theme-dom.ts';

applyChoice(loadChoice());

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
