import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db/client";
import { leaveRequests } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { getAgenda, hasAgendaAccess } from "@/services/agenda.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctInvoice,
  createTestAcctStructure,
  createTestActionPlan,
  createTestContract,
  createTestEmployee,
  createTestFranchisee,
  createTestStore,
  createTestTraining,
  createTestUser,
  createTestVisit,
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

describe("agenda du tableau de bord", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("agrège les événements à venir selon les permissions et le périmètre", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchisee = await createTestFranchisee();
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const salarie = asSession(await createTestUser({ role: "SALARIE" }));

    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    const range = { from: "2026-09-01", to: "2026-09-30" };

    await createTestVisit(other.id, { visitDate: "2026-09-03" });
    await createTestTraining(mine.id, {
      trainingDate: "2026-09-05",
      status: "PLANIFIEE",
    });
    await createTestContract(mine.id, { endDate: "2026-09-15" });
    // Échéances du journal comptable (étape 52) — visibles de la compta et
    // de la direction uniquement.
    const structure = await createTestAcctStructure({ storeId: other.id });
    await createTestAcctInvoice(structure.id, {
      dueDate: "2026-09-20",
      status: "EN_ATTENTE",
    });
    await createTestActionPlan(mine.id, {
      dueDate: "2026-09-10",
      status: "A_FAIRE",
    });
    // Hors période ou statut clos : ignorés.
    await createTestVisit(other.id, { visitDate: "2026-10-15" });
    await createTestAcctInvoice(structure.id, {
      dueDate: "2026-09-25",
      status: "PAYEE",
    });
    // Congé validé à cheval sur le début de la période.
    const emp = await createTestEmployee({ storeId: mine.id });
    await db.insert(leaveRequests).values({
      employeeId: emp.id,
      type: "CONGES_PAYES",
      startDate: "2026-08-28",
      endDate: "2026-09-02",
      status: "VALIDEE",
    });

    // Direction : toutes les sources, triées par date.
    const all = await getAgenda(direction, range);
    expect(all.map((e) => e.type)).toEqual([
      "CONGE", // ramené au 01/09 (départ avant la période)
      "VISITE", // 03/09
      "FORMATION", // 05/09
      "PLAN_ACTION", // 10/09
      "CONTRAT", // 15/09
      "FACTURE", // 20/09
    ]);
    expect(all[0].date).toBe("2026-09-01");
    expect(all[1].link).toContain("/animation/visites/");
    expect(all.find((e) => e.type === "FACTURE")!.link).toContain(
      "/compta/factures"
    );

    // Animateur : ni journal comptable ni RH.
    expect((await getAgenda(animateur, range)).map((e) => e.type)).toEqual([
      "VISITE",
      "FORMATION",
      "PLAN_ACTION",
      "CONTRAT",
    ]);

    // Franchisé : uniquement ses boutiques ; pas de visites, factures, congés.
    expect((await getAgenda(franchise, range)).map((e) => e.type)).toEqual([
      "FORMATION",
      "PLAN_ACTION",
      "CONTRAT",
    ]);

    // Salarié : aucune source.
    expect(hasAgendaAccess(salarie)).toBe(false);
    expect(await getAgenda(salarie, range)).toEqual([]);
  });
});
