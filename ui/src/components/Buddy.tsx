// You, the human of Otea: a filled figure, a tilted egg of a head over a pear of a body. Not a
// circle (circles are nodes, turns) and not a type icon (those are stroked). Ink in both themes;
// blue only while its Preferences menu is open, by your hand (blue means yours).
export function Buddy({ size = 17, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      className={active ? 'buddy active' : 'buddy'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6.1 21.5C4.8 21.5 4.4 20.4 4.6 19.1C5.1 15.9 8 13.7 11.8 13.7C15.6 13.7 18.5 15.9 19 19.1C19.2 20.4 18.8 21.5 17.5 21.5Z" />
      <ellipse cx="11.5" cy="7.7" rx="5" ry="4.7" transform="rotate(-10 11.5 7.7)" />
    </svg>
  );
}
