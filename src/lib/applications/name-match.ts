const TURKISH_LETTERS: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

function tokens(name: string): Set<string> {
  const folded = name
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => TURKISH_LETTERS[c])
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return new Set(folded.split(/[^\p{L}]+/u).filter((t) => t.length >= 2));
}

/** Number of shared name tokens, ignoring case, Turkish letters/diacritics and one-letter tokens. */
export function nameMatchScore(a: string, b: string): number {
  const other = tokens(b);
  let score = 0;
  for (const t of tokens(a)) if (other.has(t)) score++;
  return score;
}

/** Stable sort, best name match first; does not mutate the input. */
export function sortByNameMatch<T>(items: T[], name: string, getName: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: nameMatchScore(getName(item), name) }))
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .map((x) => x.item);
}
