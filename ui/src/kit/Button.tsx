import type { ButtonHTMLAttributes } from 'react';

// primary: the one move that hands the turn on; quiet: a bordered button on the sheet; text: a
// word that acts. 'default' is quiet (the moves' planner still names it so).
export type ButtonVariant = 'default' | 'primary' | 'quiet' | 'text';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  // Icon-only: square, and it needs an aria-label.
  icon?: boolean;
};

// The mock's .btn (mock:547-558): presses in to .97.
export function Button({
  variant = 'quiet',
  size = 'md',
  icon = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant === 'default' ? 'quiet' : variant,
    size === 'sm' ? 'sm' : '',
    icon ? 'icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}

// A quiet word with an icon, on the ground (mock:519-524): tools, Anterior/Siguiente, Ampliar.
export function GhostButton({
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={className ? `ghost-btn ${className}` : 'ghost-btn'} {...rest} />
  );
}

// A 32 px square icon button (mock:164-165): the rail's fold and +. Needs an aria-label; data-tip
// shows its tooltip.
export function IconButton({
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { 'data-tip'?: string }) {
  return <button type={type} className={className ? `ibtn ${className}` : 'ibtn'} {...rest} />;
}

// A chip that toggles (mock:681-683): the intake's board and field choices.
export function ChipButton({
  on = false,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  const classes = ['chipb', on ? 'on' : '', className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={classes} aria-pressed={on} {...rest} />;
}
