import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  getAnimateurSummary,
  getRegionSummary,
  getSeries,
  getYearComparison,
} from "@/services/revenue-analytics.service";
import { resetDb } from "./setup/reset-db";
import {
  createRevenueEntry,
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

describe("analytics CA", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("agrège la série mensuelle et la comparaison N vs N-1", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    await createRevenueEntry(store.id, { date: "2026-01-10", grossAmount: "100.00" });
    await createRevenueEntry(store.id, {
      date: "2026-01-20",
      channel: "EMPORTE",
      grossAmount: "50.00",
    });
    await createRevenueEntry(store.id, { date: "2026-03-05", grossAmount: "200.00" });
    await createRevenueEntry(store.id, { date: "2025-01-15", grossAmount: "120.00" });

    const series = await getSeries(compta, {
      granularity: "month",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(series).toEqual([
      { period: "2026-01", gross: "150.00" },
      { period: "2026-03", gross: "200.00" },
    ]);

    const comparison = await getYearComparison(compta, { year: 2026 });
    expect(comparison).toHaveLength(12);
    const january = comparison.find((r) => r.month === "2026-01");
    expect(january).toEqual({
      month: "2026-01",
      current: "150.00",
      previous: "120.00",
    });
    const february = comparison.find((r) => r.month === "2026-02");
    expect(february).toEqual({ month: "2026-02", current: "0", previous: "0" });
  });

  it("agrège par jour et par semaine", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    // Lundi 2026-08-17 et mercredi 2026-08-19 → même semaine ISO.
    await createRevenueEntry(store.id, { date: "2026-08-17", grossAmount: "10.00" });
    await createRevenueEntry(store.id, {
      date: "2026-08-19",
      channel: "EMPORTE",
      grossAmount: "5.00",
    });

    const days = await getSeries(compta, {
      granularity: "day",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(days.map((d) => d.period)).toEqual(["2026-08-17", "2026-08-19"]);

    const weeks = await getSeries(compta, {
      granularity: "week",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(weeks).toEqual([{ period: "2026-08-17", gross: "15.00" }]);
  });

  it("filtre par région et par boutique, et agrège par animateur", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const animateur = await createTestUser({ role: "ANIMATION" });
    const nord = await createTestStore({ region: "Nord", animateurId: animateur.id });
    const sud = await createTestStore({ region: "Sud" });
    await createRevenueEntry(nord.id, { date: "2026-08-01", grossAmount: "300.00" });
    await createRevenueEntry(sud.id, { date: "2026-08-01", grossAmount: "100.00" });

    const nordOnly = await getSeries(compta, {
      granularity: "month",
      from: "2026-08-01",
      to: "2026-08-31",
      region: "Nord",
    });
    expect(nordOnly).toEqual([{ period: "2026-08", gross: "300.00" }]);

    const sudOnly = await getSeries(compta, {
      granularity: "month",
      from: "2026-08-01",
      to: "2026-08-31",
      storeId: sud.id,
    });
    expect(sudOnly).toEqual([{ period: "2026-08", gross: "100.00" }]);

    const regions = await getRegionSummary(compta, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(regions.map((r) => [r.region, r.gross, r.storeCount])).toEqual([
      ["Nord", "300.00", 1],
      ["Sud", "100.00", 1],
    ]);

    const animateurs = await getAnimateurSummary(compta, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(animateurs).toHaveLength(2);
    expect(animateurs[0].animateurId).toBe(animateur.id);
    expect(animateurs[0].gross).toBe("300.00");
    expect(animateurs[1].animateurId).toBeNull();
  });

  it("scope le franchisé sur ses boutiques, y compris dans la comparaison N-1", async () => {
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    await createRevenueEntry(mine.id, { date: "2026-08-01", grossAmount: "80.00" });
    await createRevenueEntry(other.id, { date: "2026-08-01", grossAmount: "500.00" });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const series = await getSeries(franchise, {
      granularity: "month",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(series).toEqual([{ period: "2026-08", gross: "80.00" }]);

    const comparison = await getYearComparison(franchise, { year: 2026 });
    const august = comparison.find((r) => r.month === "2026-08");
    expect(august?.current).toBe("80.00");

    // Sans franchisé rattaché : aucun résultat plutôt qu'une fuite réseau.
    const orphan = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: null })
    );
    expect(
      await getSeries(orphan, {
        granularity: "month",
        from: "2026-08-01",
        to: "2026-08-31",
      })
    ).toEqual([]);
  });
});
