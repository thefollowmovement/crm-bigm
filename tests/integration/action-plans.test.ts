import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addPlanComment,
  createPlan,
  getPlan,
  listPlans,
  transitionPlan,
} from "@/services/action-plans.service";
import { runActionPlanOverdueJob } from "@/lib/jobs/action-plan-overdue";
import { resetDb } from "./setup/reset-db";
import {
  createTestActionPlan,
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

describe("plans d'action", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("workflow complet avec validation réservée au créateur, notifications aux bons destinataires", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const collegue = asSession(await createTestUser({ role: "ANIMATION" }));
    const store = await createTestStore();

    const plan = await createPlan(animateur, {
      storeId: store.id,
      visitId: null,
      title: "Refaire la vitrine",
      description: null,
      priority: "HAUTE",
      assigneeId: collegue.id,
      dueDate: "2026-09-15",
      files: [],
    });
    expect(plan.status).toBe("A_FAIRE");

    // L'assigné a été notifié à la création.
    const assigneeNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, collegue.id),
    });
    expect(assigneeNotifs).toHaveLength(1);

    await transitionPlan(collegue, plan.id, "EN_COURS");
    await transitionPlan(collegue, plan.id, "TERMINE");

    // Le collègue (non créateur) ne peut pas valider.
    await expect(transitionPlan(collegue, plan.id, "VALIDE")).rejects.toThrow(
      ForbiddenError
    );
    const validated = await transitionPlan(animateur, plan.id, "VALIDE");
    expect(validated.status).toBe("VALIDE");
    expect(validated.validatedAt).not.toBeNull();

    await addPlanComment(animateur, plan.id, "Bien joué.");
    const detail = await getPlan(animateur, plan.id);
    expect(detail?.comments).toHaveLength(1);
  });

  it("le job de relance est idempotent et cible assigné + créateur + animateur boutique", async () => {
    const creator = await createTestUser({ role: "ANIMATION" });
    const assignee = await createTestUser({ role: "COMPTABILITE" });
    const storeAnimateur = await createTestUser({ role: "ANIMATION" });
    const store = await createTestStore({ animateurId: storeAnimateur.id });

    await createTestActionPlan(store.id, {
      status: "EN_COURS",
      dueDate: "2026-01-01", // échéance largement dépassée
      assigneeId: assignee.id,
      createdById: creator.id,
    });
    // Plan sans échéance : jamais relancé.
    await createTestActionPlan(store.id, {
      status: "A_FAIRE",
      createdById: creator.id,
    });

    const first = await runActionPlanOverdueJob();
    expect(first.reminded).toBe(1);
    expect(first.notified).toBe(3); // assigné + créateur + animateur

    const second = await runActionPlanOverdueJob();
    expect(second.reminded).toBe(0);
    expect(second.notified).toBe(0);

    const notifs = await db.query.notifications.findMany({
      where: and(eq(notifications.type, "PLAN_ACTION")),
    });
    expect(notifs).toHaveLength(3);
  });

  it("le franchisé ne liste que les plans de ses boutiques et ne peut pas écrire", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    await createTestActionPlan(mine.id, { createdById: animateur.id, title: "Chez moi" });
    await createTestActionPlan(other.id, { createdById: animateur.id, title: "Ailleurs" });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const plans = await listPlans(franchise);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Chez moi");

    await expect(
      createPlan(franchise, {
        storeId: mine.id,
        visitId: null,
        title: "Interdit",
        description: null,
        priority: "NORMALE",
        assigneeId: null,
        dueDate: null,
        files: [],
      })
    ).rejects.toThrow(ForbiddenError);

    // Et il ne peut pas lire un plan d'une autre boutique.
    const otherPlan = (await listPlans(asSession(await createTestUser({ role: "ADMIN" })))).find(
      (p) => p.title === "Ailleurs"
    );
    await expect(getPlan(franchise, otherPlan!.id)).rejects.toThrow(ForbiddenError);
  });
});
