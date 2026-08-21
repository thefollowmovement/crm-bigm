// Calculs du Food Cost — fichier PUR, très testé en unit.
//
// Précision : tarifs unitaires et quantités en numeric(12,4) (strings à
// 4 décimales max) ; l'arithmétique passe par des ENTIERS en dix-millièmes
// (BigInt pour les produits, 8 décimales intermédiaires), jamais par des
// flottants. Les montants finaux redeviennent des strings à 2 décimales
// (arrondi half-up), conformes à lib/money.

import { toCents } from "@/lib/money";

const QTY_RE = /^\d{1,8}(?:\.\d{1,4})?$/;

// "0.1500" → 1500 dix-millièmes. Lève sur tout format invalide.
export function toTenThousandths(value: string): bigint {
  if (typeof value !== "string" || !QTY_RE.test(value)) {
    throw new Error(`Valeur invalide : « ${value} » (4 décimales max).`);
  }
  const [intPart, decPart = ""] = value.split(".");
  return BigInt(intPart) * BigInt(10_000) + BigInt(decPart.padEnd(4, "0"));
}

// L'UI saisit les solides en grammes et les liquides en millilitres ; la
// base stocke en KG / L / PIECE. "150" g → "0.1500" kg.
export function convertToBaseUnit(
  raw: string,
  unit: "KG" | "L" | "PIECE"
): string {
  if (unit === "PIECE") {
    if (!QTY_RE.test(raw)) throw new Error(`Quantité invalide : « ${raw} ».`);
    return formatTenThousandths(toTenThousandths(raw));
  }
  // grammes ou millilitres, entiers ou 1 décimale
  if (!/^\d{1,7}(?:\.\d)?$/.test(raw)) {
    throw new Error(`Quantité invalide : « ${raw} » (en g ou ml).`);
  }
  const [intPart, decPart = ""] = raw.split(".");
  // g → kg : ÷ 1000, soit un décalage de 3 rangs sur des dix-millièmes
  const tenths = BigInt(intPart) * BigInt(10) + BigInt(decPart.padEnd(1, "0"));
  return formatTenThousandths(tenths); // 1 dixième de g = 1 dix-millième de kg
}

// 1500n → "0.1500" (toujours 4 décimales, format numeric Postgres).
export function formatTenThousandths(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const abs = value < BigInt(0) ? -value : value;
  const intPart = abs / BigInt(10_000);
  const dec = abs % BigInt(10_000);
  return `${sign}${intPart}.${dec.toString().padStart(4, "0")}`;
}

// Coût matière d'une recette : Σ quantité × tarif unitaire, en entiers
// (10^-8 € intermédiaires), arrondi half-up au centime. Sortie "12.34".
export function computeRecipeCost(
  items: { quantity: string; pricePerUnit: string }[]
): string {
  let totalHundredMillionths = BigInt(0); // 10^-8 €
  for (const item of items) {
    totalHundredMillionths +=
      toTenThousandths(item.quantity) * toTenThousandths(item.pricePerUnit);
  }
  // half-up : +½ centime (5 × 10^5 unités de 10^-8 €) avant division entière
  const cents = (totalHundredMillionths + BigInt(500_000)) / BigInt(1_000_000);
  const sign = cents < BigInt(0) ? "-" : "";
  const abs = cents < BigInt(0) ? -cents : cents;
  return `${sign}${abs / BigInt(100)}.${(abs % BigInt(100)).toString().padStart(2, "0")}`;
}

// Part du coût matière dans le prix de vente HT, en % (1 décimale).
// null si le prix de vente est absent ou nul.
export function foodCostPct(
  cost: string,
  salePriceHT: string | null
): string | null {
  if (!salePriceHT) return null;
  const priceCents = toCents(salePriceHT);
  if (priceCents <= 0) return null;
  const costCents = toCents(cost);
  const tenths = Math.round((costCents * 1000) / priceCents);
  return (tenths / 10).toFixed(1);
}
