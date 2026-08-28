import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { runAuditOverdueJob } from "@/lib/jobs/audit-overdue";
import {
  getNetworkDashboard,
  getStoreDashboard,
} from "@/services/dashboard.service";
import { addDaysIso, todayParis } from "@/lib/dates";
import { resetDb } from "./setup/reset-db";
import {
  createTestAcctInvoice,
  createTestAcctStructure,
  createTestActionPlan,
  createTestCriterion,
  createTestFranchisee,
  createTestStore,
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

describe("job audit-overdue", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("signale les boutiques sans audit récent, une fois par mois", async () => {
    const direction = await createTestUser({ role: "DIRECTION" });
    const animateur = await createTestUser({ role: "ANIMATION" });
    const neverAudited = await createTestStore({ animateurId: animateur.id });
    const recentlyAudited = await createTestStore();

    const criterion = await createTestCriterion();
    const today = todayParis();
    await createTestVisit(recentlyAudited.id, {
      type: "AUDIT",
      status: "FINALISEE",
      visitDate: addDaysIso(today, -10),
      visitedById: animateur.id,
    });
    void criterion;

    const first = await runAuditOverdueJob();
    expect(first.alerted).toBe(1); // seule la boutique jamais auditée
    expect(first.notified).toBe(2); // direction + animateur

    const second = await runAuditOverdueJob();
    expect(second.alerted).toBe(1);
    expect(second.notified).toBe(0); // dedupeKey mensuel

    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, direction.id),
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toContain(neverAudited.code);
  });
});

describe("dashboards", () => {
  beforeEach(async () => {
    await resetDb();
  });

  // Étape 52 : le CA, les impayés et les classements viennent du journal
  // comptable (structures rattachées aux boutiques).
  it("le dashboard réseau expose les blocs selon les permissions du rôle", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const communication = asSession(await createTestUser({ role: "COMMUNICATION" }));
    const store = await createTestStore();
    const structure = await createTestAcctStructure({ storeId: store.id });

    const today = todayParis();
    await createTestAcctInvoice(structure.id, {
      pieceDate: today,
      amountHT: "750.00",
      amountTTC: "900.00",
      status: "PAYEE",
    });
    await createTestAcctInvoice(structure.id, {
      pieceDate: today,
      dueDate: addDaysIso(today, -5),
      amountHT: "1000.00",
      amountTTC: "1200.00",
      status: "EN_ATTENTE",
    });

    const forDirection = await getNetworkDashboard(direction);
    expect(forDirection?.revenue?.current).toBe("1750.00"); // 750 + 1000 HT
    expect(forDirection?.unpaid).toEqual({ count: 1, totalTTC: "1200.00" });
    expect(forDirection?.topStores[0].code).toBe(store.code);

    // La communication n'a pas accounting:read : ces blocs sont ABSENTS du
    // payload (jamais « masqués en CSS »), les tickets restent.
    const forCommunication = await getNetworkDashboard(communication);
    expect(forCommunication?.unpaid).toBeNull();
    expect(forCommunication?.revenue).toBeNull();
    expect(forCommunication?.topStores).toEqual([]);
    expect(forCommunication?.lateTickets).toBe(0);
  });

  it("le dashboard boutique d'un franchisé est scopé, sans données compta", async () => {
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const compta = await createTestUser({ role: "COMPTABILITE" });
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const today = todayParis();
    await createTestActionPlan(mine.id, {
      status: "EN_COURS",
      dueDate: addDaysIso(today, -1),
      createdById: compta.id,
    });

    const data = await getStoreDashboard(franchise, mine.id);
    expect(data.plans).toEqual({ open: 1, late: 1 });
    expect(data.lastAudit).toBeNull(); // pas de visit:read
    // Aucun bloc CA/impayés dans le payload : ces données sont comptables.
    expect(data).not.toHaveProperty("revenue");
    expect(data).not.toHaveProperty("unpaid");

    // Et pas d'accès au dashboard d'une autre boutique.
    const other = await createTestStore();
    await expect(getStoreDashboard(franchise, other.id)).rejects.toThrow();
  });
});
