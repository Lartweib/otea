import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'quiet';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  // Icon-only: square, round, and it needs an aria-label.
  icon?: boolean;
};

// Pill button. One primary per screen: the move that hands the turn on.
export function Button({
  variant = 'default',
  size = 'md',
  icon = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant === 'default' ? '' : variant,
    size === 'sm' ? 'sm' : '',
    icon ? 'icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
