import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, dpsPurchases } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createDepot,
  getPurchasesVsRevenue,
  getStorePurchases,
  importRows,
  upsertPurchase,
} from "@/services/purchases.service";
import { resetDb } from "./setup/reset-db";
import {
  createRevenueEntry,
  createTestDepot,
  createTestFranchisee,
  createTestPurchase,
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

afterAll(async () => {
  await pool.end();
});

describe("achats DPS", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("saisie : remplace la même référence, refuse un dépôt inactif", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    const depot = await createTestDepot();

    await upsertPurchase(compta, {
      storeId: store.id,
      depotId: depot.id,
      date: "2026-08-05",
      reference: "BL-100",
      amount: "500.00",
      notes: null,
    });
    await upsertPurchase(compta, {
      storeId: store.id,
      depotId: depot.id,
      date: "2026-08-05",
      reference: "BL-100",
      amount: "650.00",
      notes: "corrigé",
    });

    const month = await getStorePurchases(compta, store.id, "2026-08");
    expect(month.rows).toHaveLength(1);
    expect(month.total).toBe("650.00");

    const inactive = await createTestDepot({ isActive: false });
    await expect(
      upsertPurchase(compta, {
        storeId: store.id,
        depotId: inactive.id,
        date: "2026-08-06",
        reference: "BL-101",
        amount: "10.00",
        notes: null,
      })
    ).rejects.toThrow(/Dépôt introuvable/);
  });

  it("import CSV idempotent avec codes inconnus signalés et audit agrégé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore({ code: "BM-ACH" });
    await createTestDepot({ code: "DPS-OK" });

    const rows = [
      {
        storeCode: "BM-ACH",
        depotCode: "DPS-OK",
        date: "2026-08-01",
        reference: "BL-1",
        amount: "100.00",
      },
      {
        storeCode: "BM-ACH",
        depotCode: "DPS-OK",
        date: "2026-08-02",
        reference: "BL-2",
        amount: "200.00",
      },
      {
        storeCode: "BM-ACH",
        depotCode: "DPS-INCONNU",
        date: "2026-08-03",
        reference: "BL-3",
        amount: "300.00",
      },
    ];
    const first = await importRows(compta, rows);
    expect(first.imported).toBe(2);
    expect(first.errors[0].message).toContain("DPS-INCONNU");

    const second = await importRows(compta, rows);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(2);
    expect(
      await db.query.dpsPurchases.findMany({
        where: eq(dpsPurchases.storeId, store.id),
      })
    ).toHaveLength(2);

    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tableName, "dps_purchases"),
    });
    expect(logs.filter((l) => l.action === "IMPORT")).toHaveLength(2);
    expect(logs.filter((l) => l.action !== "IMPORT")).toHaveLength(0);
  });

  it("le ratio achats/CA par mois est exact et scopé pour un franchisé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    const depot = await createTestDepot();

    await createRevenueEntry(mine.id, {
      date: "2026-08-10",
      grossAmount: "1000.00",
      enteredById: compta.id,
    });
    await createTestPurchase(mine.id, {
      date: "2026-08-11",
      amount: "300.00",
      depotId: depot.id,
      enteredById: compta.id,
    });
    await createRevenueEntry(other.id, {
      date: "2026-08-10",
      grossAmount: "500.00",
      enteredById: compta.id,
    });
    await createTestPurchase(other.id, {
      date: "2026-08-12",
      amount: "400.00",
      depotId: depot.id,
      enteredById: compta.id,
    });

    const all = await getPurchasesVsRevenue(compta, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(all).toEqual([
      {
        period: "2026-08",
        purchases: "700.00",
        revenue: "1500.00",
        ratioPct: "46.7",
      },
    ]);

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const scoped = await getPurchasesVsRevenue(franchise, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(scoped).toEqual([
      {
        period: "2026-08",
        purchases: "300.00",
        revenue: "1000.00",
        ratioPct: "30.0",
      },
    ]);

    // Écriture interdite au franchisé et à l'animation.
    await expect(
      upsertPurchase(franchise, {
        storeId: mine.id,
        depotId: depot.id,
        date: "2026-08-13",
        reference: "BL-X",
        amount: "1.00",
        notes: null,
      })
    ).rejects.toThrow(ForbiddenError);
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    await expect(createDepot(animateur, { code: "X", name: "X", city: null })).rejects.toThrow(
      ForbiddenError
    );
  });
});
