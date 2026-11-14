import type { Enums } from "@/lib/supabase/database.types";

// The 39 districts of Istanbul and the side of the Bosphorus they belong to.
// Adalar (Princes' Islands) is administratively on the Asian side.
export const ISTANBUL_DISTRICTS = {
  Adalar: "asian",
  Arnavutköy: "european",
  Ataşehir: "asian",
  Avcılar: "european",
  Bağcılar: "european",
  Bahçelievler: "european",
  Bakırköy: "european",
  Başakşehir: "european",
  Bayrampaşa: "european",
  Beşiktaş: "european",
  Beykoz: "asian",
  Beylikdüzü: "european",
  Beyoğlu: "european",
  Büyükçekmece: "european",
  Çatalca: "european",
  Çekmeköy: "asian",
  Esenler: "european",
  Esenyurt: "european",
  Eyüpsultan: "european",
  Fatih: "european",
  Gaziosmanpaşa: "european",
  Güngören: "european",
  Kadıköy: "asian",
  Kağıthane: "european",
  Kartal: "asian",
  Küçükçekmece: "european",
  Maltepe: "asian",
  Pendik: "asian",
  Sancaktepe: "asian",
  Sarıyer: "european",
  Silivri: "european",
  Sultanbeyli: "asian",
  Sultangazi: "european",
  Şile: "asian",
  Şişli: "european",
  Tuzla: "asian",
  Ümraniye: "asian",
  Üsküdar: "asian",
  Zeytinburnu: "european",
} as const satisfies Record<string, Enums<"istanbul_side">>;

export type IstanbulDistrict = keyof typeof ISTANBUL_DISTRICTS;

export const ISTANBUL = "İstanbul";

export const istanbulDistrictNames = Object.keys(ISTANBUL_DISTRICTS)
  .filter(isIstanbulDistrict)
  .sort((a, b) => a.localeCompare(b, "tr"));

export function isIstanbulDistrict(value: string): value is IstanbulDistrict {
  return Object.hasOwn(ISTANBUL_DISTRICTS, value);
}

export function sideOfDistrict(district: string) {
  return isIstanbulDistrict(district) ? ISTANBUL_DISTRICTS[district] : null;
}
