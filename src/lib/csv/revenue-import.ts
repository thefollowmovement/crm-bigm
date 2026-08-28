// Helpers PURS de parsing « à la française » partagés par tous les imports
// (ventes produits, achats DPS, journal comptable, référentiel structures).
// L'ancien mapping CSV du CA par canal a disparu avec le module Finances
// (étape 52) ; le nom du fichier est conservé pour ne pas casser les imports.
// Tolérant aux exports Excel : BOM, montants « 1 234,56 », dates JJ/MM/AAAA.

export type ParseError = { line: number; message: string };

// "1 234,56" / "1234.56" / "1234" → "1234.56" ; null si illisible.
export function parseFrenchAmount(raw: string): string | null {
  // retire espaces normaux, insécables et fines, symbole €
  const cleaned = raw.replace(/[\s  €]/g, "");
  if (cleaned === "") return null;
  const dotted = cleaned.replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(dotted)) return null;
  const [int, dec = ""] = dotted.replace("-", "").split(".");
  const sign = dotted.startsWith("-") ? "-" : "";
  return `${sign}${int}.${dec.padEnd(2, "0")}`;
}

// "1 234" / "1234" → 1234 (entier positif ou nul) ; null si illisible.
export function parseFrenchInteger(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

// "21/08/2026" ou "2026-08-21" → ISO ; null si invalide.
export function parseFrenchDate(raw: string): string | null {
  const value = raw.trim();
  let year: number, month: number, day: number;
  const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fr) {
    day = Number(fr[1]);
    month = Number(fr[2]);
    year = Number(fr[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
