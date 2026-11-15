// "Ayşe Nur Yılmaz" → "AY" (Turkish-aware uppercasing).
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toLocaleUpperCase("tr");
}
