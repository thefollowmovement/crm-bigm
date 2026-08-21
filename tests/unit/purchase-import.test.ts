import { describe, expect, it } from "vitest";

import { parsePurchaseCsv } from "@/lib/csv/purchase-import";
import { purchaseRatioPct } from "@/services/purchases.service";

describe("parsePurchaseCsv", () => {
  it("lit un export français typique et normalise le code dépôt", () => {
    const csv =
      "﻿Boutique;Dépôt;Date;Référence;Montant\n" +
      "BM-001;dps-lyon;21/08/2026;BL-1234;1 250,00\n" +
      "BM-003;DPS-PARIS;2026-08-20;BL-1235;540,10\n";
    const { rows, errors } = parsePurchaseCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      storeCode: "BM-001",
      depotCode: "DPS-LYON",
      date: "2026-08-21",
      reference: "BL-1234",
      amount: "1250.00",
    });
  });

  it("signale les lignes incomplètes sans bloquer les valides", () => {
    const csv =
      "boutique;depot;date;reference;montant\n" +
      "BM-001;DPS-LYON;21/08/2026;BL-1;100,00\n" +
      ";DPS-LYON;21/08/2026;BL-2;100,00\n" +
      "BM-001;;21/08/2026;BL-3;100,00\n" +
      "BM-001;DPS-LYON;21/08/2026;;100,00\n" +
      "BM-001;DPS-LYON;21/08/2026;BL-5;abc\n";
    const { rows, errors } = parsePurchaseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });

  it("exige toutes les colonnes obligatoires", () => {
    const { errors } = parsePurchaseCsv("boutique;date\nBM-001;21/08/2026\n");
    expect(errors.some((e) => e.message.includes("depot"))).toBe(true);
    expect(errors.some((e) => e.message.includes("reference"))).toBe(true);
    expect(errors.some((e) => e.message.includes("montant"))).toBe(true);
  });
});

describe("purchaseRatioPct", () => {
  it("calcule le ratio achats/CA en centimes entiers, null si CA nul", () => {
    expect(purchaseRatioPct("300.00", "1000.00")).toBe("30.0");
    expect(purchaseRatioPct("333.33", "1000.00")).toBe("33.3");
    expect(purchaseRatioPct("1520.50", "980.40")).toBe("155.1");
    expect(purchaseRatioPct("100.00", "0")).toBeNull();
    expect(purchaseRatioPct("0", "1000.00")).toBe("0.0");
  });
});
