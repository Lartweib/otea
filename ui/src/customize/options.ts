// The options of a Choice field: trimmed, never empty, never twice (ignoring case).
export function addOption(options: readonly string[], raw: string): readonly string[] {
  const label = raw.trim();
  if (!label) return options;
  if (options.some((o) => o.toLowerCase() === label.toLowerCase())) return options;
  return [...options, label];
}

export function removeOption(options: readonly string[], label: string): readonly string[] {
  return options.filter((o) => o !== label);
}
