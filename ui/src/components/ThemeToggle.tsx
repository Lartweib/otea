import { useState } from 'react';
import { Button, Icon, type IconName } from '../kit/index.ts';
import { nextChoice, type ThemeChoice, themeLabel } from '../theme.ts';
import { loadChoice, switchChoice } from '../theme-dom.ts';

const ICON: Record<ThemeChoice, IconName> = { system: 'system', light: 'sun', dark: 'moon' };

export function ThemeToggle() {
  const [choice, setChoice] = useState(loadChoice);
  const next = nextChoice(choice);
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      aria-label={`${themeLabel(choice)}. Switch to ${next}.`}
      title={themeLabel(choice)}
      onClick={(event) => {
        switchChoice(choice, next, event.currentTarget);
        setChoice(next);
      }}
    >
      <Icon name={ICON[choice]} />
    </Button>
  );
}
