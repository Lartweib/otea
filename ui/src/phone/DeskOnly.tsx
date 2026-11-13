import { useApp } from '../app/context.tsx';
import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/Button.tsx';
import { Icon } from '../kit/Icon.tsx';
import type { Route } from '../selection.ts';

// The pages the phone leaves to the computer (mobile mock, scope): Studio, Settings and the module
// catalog. A link or a typed address that reaches one on the phone gets its head and a line saying
// where it is, with the way back to Te toca, never a page whose every write the server refuses.

export type DeskPage = 'studio' | 'settings' | 'modules';

export function deskOnlyOf(route: Route): DeskPage | null {
  switch (route.view) {
    case 'studio':
    case 'settings':
    case 'modules':
      return route.view;
    default:
      return null;
  }
}

const TITLE = { studio: 'nav.studio', settings: 'nav.settings', modules: 'app.modules' } as const;

export function DeskOnly({ page }: { page: DeskPage }) {
  const app = useApp();
  return (
    <div className="deskonly">
      <header className="head" data-enter="head">
        <div className="kicker" data-leaf="">
          <b>{app.project?.name ?? ''}</b>
        </div>
        <h1 className="display" data-leaf="">
          {t(TITLE[page])}
        </h1>
      </header>
      <div className="empty empty-big empty-missing" data-enter="fade" data-leaf="">
        <p className="desk">
          <Icon name="sys" />
          <span>
            {t(`phone.deskOnly.${page}`)} {t('phone.deskOnly.text')}
          </span>
        </p>
        <div className="acts2">
          <Button variant="primary" onClick={() => app.go({ view: 'toca' })}>
            {t('boardView.missing.home')}
          </Button>
        </div>
      </div>
    </div>
  );
}
