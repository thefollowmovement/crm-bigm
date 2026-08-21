// Dates civiles (YYYY-MM-DD) en fuseau Europe/Paris — règle CLAUDE.md n°7 :
// jamais de comparaison de jours via Date minuit UTC.

const PARIS_FORMAT = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Date du jour en Europe/Paris, au format ISO "YYYY-MM-DD".
export function todayParis(now: Date = new Date()): string {
  return PARIS_FORMAT.format(now);
}

// Ajoute des mois à une date ISO en écrêtant au dernier jour du mois
// (31 janvier + 1 mois → 28/29 février), comme les échéances contractuelles.
export function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${String(targetYear).padStart(4, "0")}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

// Ajoute (ou retire) des jours à une date ISO.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Différence en jours entiers entre deux dates ISO (b - a).
export function daysBetweenIso(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

// Formatage français d'une date ISO.
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(
    new Date(`${iso}T00:00:00`)
  );
}
