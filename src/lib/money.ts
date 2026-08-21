// Arithmétique monétaire en CENTIMES ENTIERS — règle CLAUDE.md n°6 :
// les montants sont des strings "1234.50" (numeric(12,2) côté Postgres) et
// toute comparaison/addition passe par les centimes, jamais par parseFloat.
// Fichier pur (pas de "server-only") : utilisé aussi côté client pour
// afficher le TTC calculé dans les formulaires.

const AMOUNT_RE = /^-?\d+(?:\.\d{1,2})?$/;

// "1234.50" → 123450. Lève sur tout format invalide ("", "12,5", "1e3"…).
export function toCents(amount: string): number {
  if (typeof amount !== "string" || !AMOUNT_RE.test(amount)) {
    throw new Error(`Montant invalide : « ${amount} ».`);
  }
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [intPart, decPart = ""] = unsigned.split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Montant hors limites : « ${amount} ».`);
  }
  return negative ? -cents : cents;
}

// 123450 → "1234.50" (toujours deux décimales, format numeric Postgres).
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Nombre de centimes invalide : ${cents}.`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${euros}.${String(rest).padStart(2, "0")}`;
}

// Somme exacte de montants string. Sans argument : "0.00".
export function addAmounts(...amounts: string[]): string {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0));
}

// Comparaison exacte : -1 si a < b, 0 si égaux, 1 si a > b.
export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  return 0;
}

// TTC = HT × (1 + taux/100), arrondi AU CENTIME « half-up » (10.005 → 10.01).
// Calcul 100 % entier (BigInt) : htCents × (10000 + taux en centièmes) / 10000.
export function computeTTC(amountHT: string, vatRate: string): string {
  const htCents = toCents(amountHT);
  const rateHundredths = toCents(vatRate); // "20.00" → 2000 centièmes de %
  if (rateHundredths < 0) {
    throw new Error(`Taux de TVA invalide : « ${vatRate} ».`);
  }
  const sign = htCents < 0 ? -1 : 1;
  const numerator = BigInt(Math.abs(htCents)) * BigInt(10_000 + rateHundredths);
  // half-up sur la magnitude : +½ unité avant la division entière
  const ttcCents = (numerator + BigInt(5_000)) / BigInt(10_000);
  return fromCents(sign * Number(ttcCents));
}

const EUR_FORMAT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

// "1234.5" → "1 234,50 €". Validation via toCents ; la division par 100 d'un
// entier exact suivie d'un formatage à 2 décimales est sans perte (affichage
// uniquement — jamais utilisé pour comparer ou additionner).
export function formatEUR(amount: string): string {
  return EUR_FORMAT.format(toCents(amount) / 100);
}
