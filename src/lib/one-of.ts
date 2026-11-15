/** `value` if it is one of `options` (exact match), else undefined: narrows outside input without a cast. */
export function oneOf<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return options.find((option) => option === value);
}
