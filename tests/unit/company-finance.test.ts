import { describe, expect, it } from "vitest";

import {
  CATEGORY_DIRECTION,
  FLOW_CATEGORIES,
  computeVariance,
} from "@/services/company-finance.service";

describe("CATEGORY_DIRECTION", () => {
  it("couvre les 12 catégories du cdc §5, chacune avec un sens valide", () => {
    expect(FLOW_CATEGORIES).toHaveLength(12);
    for (const category of FLOW_CATEGORIES) {
      expect(["ENTREE", "SORTIE"]).toContain(CATEGORY_DIRECTION[category]);
    }
    // 5 entrées (droits d'entrée, redevances, communication, prestations,
    // autres facturations) et 7 sorties.
    const entries = FLOW_CATEGORIES.filter(
      (c) => CATEGORY_DIRECTION[c] === "ENTREE"
    );
    expect(entries).toHaveLength(5);
    expect(CATEGORY_DIRECTION.REDEVANCE).toBe("ENTREE");
    expect(CATEGORY_DIRECTION.SALAIRES).toBe("SORTIE");
  });
});

describe("computeVariance", () => {
  it("écart = réel − budget, en strings exactes", () => {
    expect(computeVariance("4500.00", "5000.00")).toBe("-500.00");
    expect(computeVariance("6200.00", "6000.00")).toBe("200.00");
    expect(computeVariance("0.00", "0.00")).toBe("0.00");
  });
});
