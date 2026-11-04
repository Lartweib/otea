import { t } from '../i18n/i18n.ts';
import { Buddy } from './Buddy.tsx';
import { LanguageNote } from './LanguageNote.tsx';
import { useMenu } from './menu.ts';
import { PreferencesHead, PreferencesPanel } from './Preferences.tsx';
import { Sheet } from './Sheet.tsx';

function Up() {
  return (
    <svg className="menu-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.25 7.25 L6 4.5 L8.75 7.25" />
    </svg>
  );
}

// The sidebar's foot: you and Preferences. It opens this browser's preferences, upwards; on a phone,
// as a sheet. Folded, only you stay, with the name in a tooltip. onPair: this browser may pair a
// phone (this computer's signed-in one); it runs as the menu closes on the way to the pairing page.
export function PreferencesButton({
  folded = false,
  phone = false,
  onPair,
}: {
  folded?: boolean;
  phone?: boolean;
  onPair?: (() => void) | undefined;
}) {
  const menu = useMenu();
  const label = t('prefs.title');
  const panel = (
    <PreferencesPanel
      server={window.location.host}
      onPair={
        onPair
          ? () => {
              menu.close();
              onPair();
            }
          : undefined
      }
    />
  );
  return (
    <div className="prefs-anchor" ref={menu.ref}>
      <button
        type="button"
        className={folded ? 'prefs-button tip' : 'prefs-button'}
        data-tip={folded ? label : undefined}
        aria-label={folded ? label : undefined}
        aria-expanded={menu.open}
        aria-haspopup="dialog"
        onClick={menu.toggle}
      >
        <Buddy active={menu.open} />
        {folded ? null : (
          <>
            <span className="prefs-name">{label}</span>
            <Up />
          </>
        )}
      </button>
      {/* The first-run language note rests on this row, pointing at it (on a phone it stands alone). */}
      {phone ? null : <LanguageNote anchored />}
      {menu.phase === 'closed' ? null : phone ? (
        <Sheet menu={menu} label={label} title={label}>
          {panel}
        </Sheet>
      ) : (
        <div
          className="menu raised prefs-menu"
          role="dialog"
          aria-label={label}
          data-phase={menu.phase}
        >
          <PreferencesHead />
          {panel}
        </div>
      )}
    </div>
  );
}
