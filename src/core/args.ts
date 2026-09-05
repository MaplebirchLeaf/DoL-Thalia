export function readOption(args: string[], names: string[]): string | undefined {
  const arg = args.find(value => names.some(name => value.startsWith(name)));
  if (!arg) return undefined;
  const name = names.find(item => arg.startsWith(item));
  const value = name ? arg.slice(name.length).trim() : '';
  return value || undefined;
}

export function readListOption(args: string[], names: string[]): string[] {
  const values: string[] = [];
  for (const arg of args) {
    const name = names.find(item => arg.startsWith(item));
    if (!name) continue;
    values.push(
      ...arg
        .slice(name.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    );
  }
  return [...new Set(values)];
}
