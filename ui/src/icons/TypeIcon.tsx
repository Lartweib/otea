import { type IconDrawing, TYPE_ICONS } from './catalog.ts';

// The drawing for an icon name a preset gave, or nothing for a name this build does not know (a
// newer server): no icon means no icon.
export function iconDrawing(name: string | undefined): IconDrawing | undefined {
  if (name === undefined || !Object.hasOwn(TYPE_ICONS, name)) return undefined;
  return TYPE_ICONS[name as keyof typeof TYPE_ICONS];
}

type TypeIconProps = {
  name: string | undefined;
  size?: 14 | 16 | 20;
  // The type's label, when the icon is the only mark of the type; decorative otherwise.
  label?: string | undefined;
};

export function TypeIcon({ name, size = 16, label }: TypeIconProps) {
  const icon = iconDrawing(name);
  if (!icon) return null;
  return (
    <svg
      className="type-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
      <g transform={icon.rotate ? `rotate(${icon.rotate} 12 12)` : undefined}>
        <path d={icon.d} />
        {icon.fill ? <path className="type-icon-fill" d={icon.fill} /> : null}
      </g>
    </svg>
  );
}
