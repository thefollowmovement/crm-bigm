import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addFlow,
  getExpenseBreakdown,
  getMonthlyStatement,
  getYearSummary,
  listFlows,
  setBudget,
} from "@/services/company-finance.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

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

describe("finances Big M CIE", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("tableau mensuel : réel vs budget, écarts et résultat au centime", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    await addFlow(compta, {
      flowDate: "2026-08-05",
      category: "REDEVANCE",
      amount: "4500.00",
      label: "Redevances août",
      invoiceId: null,
      partnerId: null,
    });
    await addFlow(compta, {
      flowDate: "2026-08-10",
      category: "SALAIRES",
      amount: "6200.00",
      label: null,
      invoiceId: null,
      partnerId: null,
    });
    await setBudget(compta, {
      year: 2026,
      month: 8,
      category: "REDEVANCE",
      amount: "5000.00",
    });
    // L'upsert écrase le budget existant (unique année+mois+catégorie).
    await setBudget(compta, {
      year: 2026,
      month: 8,
      category: "REDEVANCE",
      amount: "5100.00",
    });

    const statement = await getMonthlyStatement(compta, 2026, 8);
    const redevance = statement.lines.find((l) => l.category === "REDEVANCE");
    expect(redevance?.actual).toBe("4500.00");
    expect(redevance?.budget).toBe("5100.00");
    expect(redevance?.variance).toBe("-600.00");
    expect(statement.totals.entries).toBe("4500.00");
    expect(statement.totals.exits).toBe("6200.00");
    expect(statement.totals.result).toBe("-1700.00");

    const year = await getYearSummary(compta, 2026);
    expect(year).toEqual([
      {
        month: "2026-08",
        entries: "4500.00",
        exits: "6200.00",
        result: "-1700.00",
      },
    ]);

    const breakdown = await getExpenseBreakdown(compta, 2026);
    expect(breakdown).toEqual([{ category: "SALAIRES", total: "6200.00" }]);
  });

  it("module fermé hors compta/direction ; facture liée vérifiée", async () => {
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );

    await expect(listFlows(rh, { year: 2026 })).rejects.toThrow(ForbiddenError);
    await expect(getMonthlyStatement(rh, 2026, 8)).rejects.toThrow(ForbiddenError);
    await expect(
      addFlow(rh, {
        flowDate: "2026-08-01",
        category: "REDEVANCE",
        amount: "1.00",
        label: null,
        invoiceId: null,
        partnerId: null,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      addFlow(compta, {
        flowDate: "2026-08-01",
        category: "REDEVANCE",
        amount: "1.00",
        label: null,
        invoiceId: "00000000-0000-0000-0000-000000000000",
        partnerId: null,
      })
    ).rejects.toThrow(/Facture introuvable/);
  });
});
