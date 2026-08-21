// Calculs d'évolution pour les tableaux de bord — fichier pur (testé en unit,
// utilisable côté client pour l'affichage). Les montants restent des strings
// numeric(12,2) : toute l'arithmétique passe par les centimes (lib/money).

import { toCents } from "@/lib/money";

// Variation en % de `current` par rapport à `previous`, arrondie à 1 décimale.
// null si la base de comparaison est nulle (pas d'évolution calculable).
export function percentChange(current: string, previous: string): number | null {
  const prev = toCents(previous);
  if (prev === 0) return null;
  const cur = toCents(current);
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

// Libellé court d'un mois ISO "YYYY-MM" → "janv. 2026" (affichage graphiques).
const MONTH_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "numeric",
});

export function formatMonthFr(isoMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(isoMonth)) return isoMonth;
  return MONTH_FORMAT.format(new Date(`${isoMonth}-01T00:00:00`));
}

// Les 12 mois ISO d'une année : ["2026-01", …, "2026-12"].
export function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
  );
}
