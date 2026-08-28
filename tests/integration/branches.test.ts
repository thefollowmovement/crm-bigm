import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addExpense,
  getBranchPnL,
  getBranchesOverview,
  listBranches,
} from "@/services/branches.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctInvoice,
  createTestAcctStructure,
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

describe("rentabilité des succursales", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("P&L mensuel exact : CA − achats − dépenses, marge en %", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const branch = await createTestStore({ type: "SUCCURSALE" });

    // CA = journal comptable de la structure rattachée (étape 52).
    const structure = await createTestAcctStructure({ storeId: branch.id });
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-08-05",
      amountHT: "8000.00",
      amountTTC: "9600.00",
    });
    await createTestAcctInvoice(structure.id, {
      pieceDate: "2026-08-12",
      amountHT: "2000.00",
      amountTTC: "2400.00",
    });
    await createTestPurchase(branch.id, { date: "2026-08-10", amount: "3000.50" });
    await addExpense(compta, {
      storeId: branch.id,
      expenseDate: "2026-08-01",
      category: "LOYER",
      amount: "2400.00",
      label: "Loyer août",
    });
    await addExpense(compta, {
      storeId: branch.id,
      expenseDate: "2026-08-15",
      category: "ENERGIE",
      amount: "99.50",
      label: null,
    });

    const months = await getBranchPnL(compta, branch.id, 2026);
    const august = months.find((m) => m.month === "2026-08");
    expect(august?.revenue).toBe("10000.00");
    expect(august?.purchases).toBe("3000.50");
    expect(august?.expenses).toBe("2499.50");
    expect(august?.expensesByCategory.LOYER).toBe("2400.00");
    expect(august?.result).toBe("4500.00");
    expect(august?.marginPct).toBe(45);

    const overview = await getBranchesOverview(compta, 2026);
    const row = overview.find((b) => b.id === branch.id);
    expect(row?.result).toBe("4500.00");
  });

  it("les dépenses ne se saisissent que pour une succursale, et hors animation", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchise = await createTestStore(); // type FRANCHISE par défaut

    await expect(
      addExpense(compta, {
        storeId: franchise.id,
        expenseDate: "2026-08-01",
        category: "LOYER",
        amount: "100.00",
        label: null,
      })
    ).rejects.toThrow(/succursale/);

    await expect(listBranches(animateur)).rejects.toThrow(ForbiddenError);
    const branch = await createTestStore({ type: "SUCCURSALE" });
    await expect(
      addExpense(animateur, {
        storeId: branch.id,
        expenseDate: "2026-08-01",
        category: "LOYER",
        amount: "100.00",
        label: null,
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
