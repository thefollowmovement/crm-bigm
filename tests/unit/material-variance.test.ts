import { describe, expect, it } from "vitest";

import {
  theoreticalCostCents,
  variancePct,
} from "@/services/material-variance.service";
import { isPurchaseAnomalous } from "@/lib/jobs/purchase-anomaly";

describe("theoreticalCostCents", () => {
  it("calcule au gramme près : quantité recette × tarif × quantité vendue", () => {
    // 150 g de steak à 4,50 €/kg = 0,675 € par burger ; ×100 = 67,50 €
    expect(
      theoreticalCostCents([{ quantity: "0.1500", pricePerUnit: "4.5000" }], 100)
    ).toBe(6750);
    // 2 ingrédients : 0,675 + (30 ml à 3,20 €/L = 0,096) = 0,771 € → ×10 = 7,71 €
    expect(
      theoreticalCostCents(
        [
          { quantity: "0.1500", pricePerUnit: "4.5000" },
          { quantity: "0.0300", pricePerUnit: "3.2000" },
        ],
        10
      )
    ).toBe(771);
    // arrondi half-up UNE seule fois, à la fin : 0,0333 kg × 3,3333 €/kg
    // = 0,11099889 € l'unité ; ×3 = 0,33299667 → 33 centimes
    expect(
      theoreticalCostCents([{ quantity: "0.0333", pricePerUnit: "3.3333" }], 3)
    ).toBe(33);
    expect(theoreticalCostCents([], 50)).toBe(0);
    expect(() =>
      theoreticalCostCents([{ quantity: "0.1000", pricePerUnit: "1.0000" }], 1.5)
    ).toThrow(/invalide/);
  });
});

describe("variancePct", () => {
  it("écart en % du théorique, null si théorique nul", () => {
    expect(variancePct(8000, 6750)).toBe(18.5);
    expect(variancePct(6000, 6750)).toBe(-11.1);
    expect(variancePct(100, 0)).toBeNull();
  });
});

describe("isPurchaseAnomalous", () => {
  const thresholds = { minRatio: 20, maxRatio: 40, maxVariancePct: 15 };

  it("détecte ratio hors bornes et écart matière excessif", () => {
    expect(
      isPurchaseAnomalous({ ratioPct: "30.0", variancePct: 5 }, thresholds).anomalous
    ).toBe(false);
    expect(
      isPurchaseAnomalous({ ratioPct: "45.2", variancePct: null }, thresholds)
    ).toMatchObject({ anomalous: true });
    expect(
      isPurchaseAnomalous({ ratioPct: "12.0", variancePct: null }, thresholds)
        .anomalous
    ).toBe(true);
    expect(
      isPurchaseAnomalous({ ratioPct: "30.0", variancePct: 18.5 }, thresholds)
        .reasons
    ).toHaveLength(1);
    expect(
      isPurchaseAnomalous({ ratioPct: "30.0", variancePct: -20 }, thresholds)
        .anomalous
    ).toBe(true);
    // Sans CA ni écart évaluable : pas d'alerte.
    expect(
      isPurchaseAnomalous({ ratioPct: null, variancePct: null }, thresholds)
        .anomalous
    ).toBe(false);
  });
});
