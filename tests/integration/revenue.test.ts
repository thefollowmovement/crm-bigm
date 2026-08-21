import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, revenueEntries } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  getNetworkSummary,
  getStoreMonth,
  importRows,
  upsertEntry,
} from "@/services/revenue.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFranchisee,
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

describe("saisie du chiffre d'affaires", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("une re-saisie du même jour/canal écrase sans dupliquer", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();

    await upsertEntry(compta, {
      storeId: store.id,
      date: "2026-08-01",
      channel: "SUR_PLACE",
      channelLabel: null,
      grossAmount: "1000.00",
      netAmount: null,
    });
    await upsertEntry(compta, {
      storeId: store.id,
      date: "2026-08-01",
      channel: "SUR_PLACE",
      channelLabel: null,
      grossAmount: "1200.00",
      netAmount: null,
    });

    const rows = await db.query.revenueEntries.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].grossAmount).toBe("1200.00");
  });

  it("le franchisé saisit SA boutique, jamais celle des autres ; l'animateur ne saisit pas", async () => {
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    await upsertEntry(franchise, {
      storeId: mine.id,
      date: "2026-08-02",
      channel: "EMPORTE",
      channelLabel: null,
      grossAmount: "500.00",
      netAmount: null,
    });

    await expect(
      upsertEntry(franchise, {
        storeId: other.id,
        date: "2026-08-02",
        channel: "EMPORTE",
        channelLabel: null,
        grossAmount: "500.00",
        netAmount: null,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      upsertEntry(animateur, {
        storeId: other.id,
        date: "2026-08-02",
        channel: "EMPORTE",
        channelLabel: null,
        grossAmount: "500.00",
        netAmount: null,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("totaux du mois corrects (sommes SQL)", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    for (const [date, channel, gross] of [
      ["2026-08-01", "SUR_PLACE", "100.10"],
      ["2026-08-02", "SUR_PLACE", "200.20"],
      ["2026-08-02", "UBER_EATS", "50.05"],
      ["2026-07-31", "SUR_PLACE", "999.99"], // hors mois
    ] as const) {
      await upsertEntry(compta, {
        storeId: store.id,
        date,
        channel,
        channelLabel: null,
        grossAmount: gross,
        netAmount: null,
      });
    }

    const month = await getStoreMonth(compta, store.id, "2026-08");
    expect(month.entries).toHaveLength(3);
    expect(month.grandTotal).toBe("350.35");
    const surPlace = month.totals.find((t) => t.channel === "SUR_PLACE");
    expect(surPlace?.gross).toBe("300.30");
  });
});

describe("import CSV", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("importe, signale les codes inconnus, reste idempotent, audite en agrégé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore({ code: "BM-IMP" });

    const rows = [
      {
        storeCode: "BM-IMP",
        date: "2026-08-01",
        channel: "SUR_PLACE" as const,
        channelLabel: null,
        grossAmount: "100.00",
        netAmount: null,
      },
      {
        storeCode: "BM-IMP",
        date: "2026-08-01",
        channel: "UBER_EATS" as const,
        channelLabel: null,
        grossAmount: "80.00",
        netAmount: "70.00",
      },
      {
        storeCode: "BM-INCONNU",
        date: "2026-08-01",
        channel: "SUR_PLACE" as const,
        channelLabel: null,
        grossAmount: "50.00",
        netAmount: null,
      },
    ];

    const first = await importRows(compta, rows);
    expect(first.imported).toBe(2);
    expect(first.updated).toBe(0);
    expect(first.errors).toHaveLength(1);
    expect(first.errors[0].message).toContain("BM-INCONNU");

    // ré-import du même fichier : mises à jour, aucun doublon
    const second = await importRows(compta, rows);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(2);
    expect(
      await db.query.revenueEntries.findMany({
        where: eq(revenueEntries.storeId, store.id),
      })
    ).toHaveLength(2);

    // audit : DEUX logs IMPORT agrégés (un par appel), zéro log CREATE/UPDATE ligne à ligne
    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tableName, "revenue_entries"),
    });
    expect(logs.filter((l) => l.action === "IMPORT")).toHaveLength(2);
    expect(logs.filter((l) => l.action !== "IMPORT")).toHaveLength(0);
    const snapshot = logs[0].snapshot as { imported: number };
    expect(snapshot.imported).toBe(2);
  });

  it("l'import exige revenue:import (le franchisé en est privé)", async () => {
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: null })
    );
    await expect(importRows(franchise, [])).rejects.toThrow(ForbiddenError);
  });

  it("le comparatif réseau agrège par boutique et respecte le scope", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const franchisee = await createTestFranchisee();
    const s1 = await createTestStore({ code: "BM-S1", franchiseeId: franchisee.id });
    const s2 = await createTestStore({ code: "BM-S2" });
    await importRows(compta, [
      {
        storeCode: "BM-S1",
        date: "2026-08-01",
        channel: "SUR_PLACE",
        channelLabel: null,
        grossAmount: "300.00",
        netAmount: null,
      },
      {
        storeCode: "BM-S2",
        date: "2026-08-01",
        channel: "SUR_PLACE",
        channelLabel: null,
        grossAmount: "100.00",
        netAmount: null,
      },
    ]);

    const all = await getNetworkSummary(compta, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(all.map((r) => r.code)).toEqual(["BM-S1", "BM-S2"]); // tri CA décroissant
    expect(all[0].gross).toBe("300.00");

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const scoped = await getNetworkSummary(franchise, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(scoped.map((r) => r.code)).toEqual(["BM-S1"]);
    void s1;
    void s2;
  });
});
