import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  getAmountDue,
  getMonthlyResults,
  getStoreRevenues,
  getYearComparison,
  sumStoreRevenueByMonth,
} from "@/services/acct-analytics.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctInvoice,
  createTestAcctStructure,
  createTestStore,
  createTestUser,
} from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

describe("analytics du journal comptable (étape 52)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("série mensuelle CA/charges/résultat, annulées exclues, avoirs inclus", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const structure = await createTestAcctStructure();

    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-07-10",
      amountHT: "1000.00",
    });
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-07-15",
      pieceType: "AVOIR",
      amountHT: "-100.00",
      amountTTC: "-120.00",
    });
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-07-20",
      accountClass: "CHARGE",
      amountHT: "300.00",
    });
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-08-05",
      amountHT: "500.00",
    });
    // Annulée : jamais comptée.
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-07-25",
      amountHT: "9999.00",
      status: "ANNULEE",
    });

    const months = await getMonthlyResults(compta, {
      from: "2026-07-01",
      to: "2026-08-31",
    });
    expect(months).toEqual([
      {
        month: "2026-07",
        revenueHT: "900.00",
        expensesHT: "300.00",
        result: "600.00",
      },
      { month: "2026-08", revenueHT: "500.00", expensesHT: "0.00", result: "500.00" },
    ]);

    const comparison = await getYearComparison(compta, { year: 2026 });
    const july = comparison.find((r) => r.month === "2026-07")!;
    expect(july.current).toBe("900.00");
    expect(july.previous).toBe("0");

    const rh = asSession(await createTestUser({ role: "RH" }));
    await expect(
      getMonthlyResults(rh, { from: "2026-07-01", to: "2026-07-31" })
    ).rejects.toThrow(ForbiddenError);
  });

  it("CA par boutique via le rattachement structure → boutique", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const storeA = await createTestStore();
    const storeB = await createTestStore();
    const linkedA = await createTestAcctStructure({ storeId: storeA.id });
    const linkedB = await createTestAcctStructure({ storeId: storeB.id });
    // Structure sans boutique : absente des classements par boutique.
    const unlinked = await createTestAcctStructure();

    await createTestAcctInvoice(linkedA.id, {
      pieceDate: "2026-08-05",
      amountHT: "800.00",
    });
    await createTestAcctInvoice(linkedB.id, {
      pieceDate: "2026-08-06",
      amountHT: "200.00",
    });
    await createTestAcctInvoice(unlinked.id, {
      pieceDate: "2026-08-07",
      amountHT: "5000.00",
    });

    const revenues = await getStoreRevenues(compta, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(revenues.map((r) => [r.code, r.revenueHT])).toEqual([
      [storeA.code, "800.00"],
      [storeB.code, "200.00"],
    ]);

    // Lecture interne par boutique/mois (achats DPS, P&L, job anomalies).
    const byMonth = await sumStoreRevenueByMonth({
      from: "2026-08-01",
      to: "2026-08-31",
      storeId: storeA.id,
    });
    expect(byMonth).toEqual([
      { storeId: storeA.id, month: "2026-08", revenueHT: "800.00" },
    ]);
  });

  it("restant dû global : TTC des pièces non soldées uniquement", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const structure = await createTestAcctStructure();
    await createTestAcctInvoice(structure.id, {
      amountTTC: "120.00",
      status: "EN_ATTENTE",
    });
    await createTestAcctInvoice(structure.id, {
      amountTTC: "60.00",
      status: "IMPAYEE",
    });
    await createTestAcctInvoice(structure.id, {
      amountTTC: "999.00",
      status: "PAYEE",
    });

    expect(await getAmountDue(compta)).toEqual({ count: 2, totalTTC: "180.00" });
  });
});
