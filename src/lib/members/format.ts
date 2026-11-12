// Pure display helpers for the member directory. Dependency-free so `node --test` can run them.

export type Motorcycle = { brand: string; model: string; cc: number | null; plate?: string | null };

/** "Yamaha MT-07 · 689 cc · 34 ABC 123"; engine size and plate are left out when unknown. */
export function formatMotorcycle({ brand, model, cc, plate }: Motorcycle) {
  return [`${brand} ${model}`, cc ? `${cc} cc` : null, plate || null].filter(Boolean).join(" · ");
}

export function instagramUrl(handle: string) {
  return `https://instagram.com/${handle}`;
}

/** "Kadıköy · Anadolu Yakası"; null when there is nothing to show (no stray separator). */
export function locationLabel(district: string | null, sideLabel: string | null) {
  const parts = [district, sideLabel].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}
