import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { runRevenueDropJob } from "@/lib/jobs/revenue-drop";
import { runAuditOverdueJob } from "@/lib/jobs/audit-overdue";
import {
  getNetworkDashboard,
  getStoreDashboard,
} from "@/services/dashboard.service";
import { addDaysIso, addMonthsIso, todayParis } from "@/lib/dates";
import { resetDb } from "./setup/reset-db";
import {
  createRevenueEntry,
  createTestActionPlan,
  createTestCriterion,
  createTestFranchisee,
  createTestInvoice,
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

describe("job revenue-drop", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("alerte la direction et l'animateur sur une forte baisse vs N-1, sans doublon la même semaine", async () => {
    const direction = await createTestUser({ role: "DIRECTION" });
    const animateur = await createTestUser({ role: "ANIMATION" });
    const enteredBy = await createTestUser({ role: "COMPTABILITE" });
    const store = await createTestStore({ animateurId: animateur.id });
    const stable = await createTestStore(); // pas de baisse

    const today = todayParis();
    // Fenêtre courante : 7 derniers jours pleins — 500 € au lieu de 1 000 €.
    await createRevenueEntry(store.id, {
      date: addDaysIso(today, -3),
      grossAmount: "500.00",
      enteredById: enteredBy.id,
    });
    await createRevenueEntry(store.id, {
      date: addMonthsIso(addDaysIso(today, -3), -12),
      grossAmount: "1000.00",
      enteredById: enteredBy.id,
    });
    // Boutique stable : même niveau que N-1.
    await createRevenueEntry(stable.id, {
      date: addDaysIso(today, -2),
      grossAmount: "900.00",
      enteredById: enteredBy.id,
    });
    await createRevenueEntry(stable.id, {
      date: addMonthsIso(addDaysIso(today, -2), -12),
      grossAmount: "1000.00",
      enteredById: enteredBy.id,
    });

    const first = await runRevenueDropJob();
    expect(first.alerted).toBe(1);
    expect(first.notified).toBe(2); // direction + animateur

    const second = await runRevenueDropJob();
    expect(second.alerted).toBe(1); // toujours en baisse…
    expect(second.notified).toBe(0); // …mais dedupeKey de la semaine déjà posé

    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, direction.id),
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toContain("Baisse de CA");
  });
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

  it("le dashboard réseau expose les blocs selon les permissions du rôle", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const communication = asSession(await createTestUser({ role: "COMMUNICATION" }));
    const compta = await createTestUser({ role: "COMPTABILITE" });
    const store = await createTestStore();

    const today = todayParis();
    await createRevenueEntry(store.id, {
      date: today,
      grossAmount: "750.00",
      enteredById: compta.id,
    });
    await createTestInvoice(store.id, {
      status: "EMISE",
      dueDate: addDaysIso(today, -5),
      amountTTC: "1200.00",
    });

    const forDirection = await getNetworkDashboard(direction);
    expect(forDirection?.revenue?.current).toBe("750.00");
    expect(forDirection?.unpaid).toEqual({ count: 1, totalTTC: "1200.00" });
    expect(forDirection?.topStores[0].code).toBe(store.code);

    // La communication n'a ni finance:read ni revenue:read : ces blocs sont
    // ABSENTS du payload (jamais « masqués en CSS »), les tickets restent.
    const forCommunication = await getNetworkDashboard(communication);
    expect(forCommunication?.unpaid).toBeNull();
    expect(forCommunication?.revenue).toBeNull();
    expect(forCommunication?.topStores).toEqual([]);
    expect(forCommunication?.lateTickets).toBe(0);
  });

  it("le dashboard boutique d'un franchisé est scopé et sans bloc finances", async () => {
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const compta = await createTestUser({ role: "COMPTABILITE" });
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const today = todayParis();
    await createRevenueEntry(mine.id, {
      date: today,
      grossAmount: "320.00",
      orderCount: 20,
      enteredById: compta.id,
    });
    await createTestActionPlan(mine.id, {
      status: "EN_COURS",
      dueDate: addDaysIso(today, -1),
      createdById: compta.id,
    });

    const data = await getStoreDashboard(franchise, mine.id);
    expect(data.revenue.current).toBe("320.00");
    expect(data.averageBasket).toBe("16.00");
    expect(data.plans).toEqual({ open: 1, late: 1 });
    expect(data.unpaid).toBeNull(); // pas de finance:read
    expect(data.lastAudit).toBeNull(); // pas de visit:read

    // Et pas d'accès au dashboard d'une autre boutique.
    const other = await createTestStore();
    await expect(getStoreDashboard(franchise, other.id)).rejects.toThrow();
  });
});
