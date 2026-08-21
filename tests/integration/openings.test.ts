import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications, openingSteps } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  STEP_ORDER,
  addChecklistItem,
  createProject,
  getProject,
  listProjects,
  setChecklistItemStatus,
  transitionStep,
  updateStep,
} from "@/services/openings.service";
import { runOpeningLateJob } from "@/lib/jobs/opening-late";
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

describe("projets d'ouverture", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("création gardée : franchise EN_PROJET uniquement, 8 jalons générés, un seul projet", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    const open = await createTestStore({ status: "OUVERTE" });
    await expect(
      createProject(dev, { storeId: open.id, targetOpeningDate: null, notes: null })
    ).rejects.toThrow(/EN PROJET/);

    const branch = await createTestStore({ type: "SUCCURSALE", status: "EN_PROJET" });
    await expect(
      createProject(dev, { storeId: branch.id, targetOpeningDate: null, notes: null })
    ).rejects.toThrow(/EN PROJET/);

    const target = await createTestStore({ status: "EN_PROJET" });
    await expect(
      createProject(animateur, {
        storeId: target.id,
        targetOpeningDate: null,
        notes: null,
      })
    ).rejects.toThrow(ForbiddenError);

    const project = await createProject(dev, {
      storeId: target.id,
      targetOpeningDate: "2027-01-15",
      notes: null,
    });
    const detail = await getProject(dev, project.id);
    expect(detail?.steps.map((s) => s.step)).toEqual([...STEP_ORDER]);
    expect(detail?.progress).toEqual({ done: 0, total: 8, pct: 0 });

    await expect(
      createProject(dev, { storeId: target.id, targetOpeningDate: null, notes: null })
    ).rejects.toThrow(/déjà/);
  });

  it("jalons : machine à états, doneDate posée puis effacée à la réouverture", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );
    const store = await createTestStore({ status: "EN_PROJET" });
    const project = await createProject(dev, {
      storeId: store.id,
      targetOpeningDate: null,
      notes: null,
    });
    const detail = await getProject(dev, project.id);
    const dip = detail!.steps[0];

    await expect(transitionStep(dev, dip.id, "TERMINEE")).rejects.toThrow(
      ForbiddenError
    );
    await transitionStep(dev, dip.id, "EN_COURS");
    const done = await transitionStep(dev, dip.id, "TERMINEE");
    expect(done.doneDate).not.toBeNull();

    const reopened = await transitionStep(dev, dip.id, "EN_COURS");
    expect(reopened.doneDate).toBeNull();
  });

  it("checklist collaborative : chaque pôle gère ses items, le développement gère tout", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );
    const com = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );
    const store = await createTestStore({ status: "EN_PROJET" });
    const project = await createProject(dev, {
      storeId: store.id,
      targetOpeningDate: null,
      notes: null,
    });

    // La communication crée et coche SES items.
    const item = await addChecklistItem(com, project.id, {
      label: "Kit PLV",
      pole: "COMMUNICATION",
      assigneeId: null,
      dueDate: null,
    });
    const doneItem = await setChecklistItemStatus(com, item.id, "TERMINE");
    expect(doneItem.doneAt).not.toBeNull();

    // …mais pas ceux d'un autre pôle.
    await expect(
      addChecklistItem(com, project.id, {
        label: "Dossier bancaire",
        pole: "COMPTABILITE",
        assigneeId: null,
        dueDate: null,
      })
    ).rejects.toThrow(ForbiddenError);

    const comptaItem = await addChecklistItem(dev, project.id, {
      label: "Dossier bancaire",
      pole: "COMPTABILITE",
      assigneeId: null,
      dueDate: null,
    });
    await expect(
      setChecklistItemStatus(com, comptaItem.id, "TERMINE")
    ).rejects.toThrow(ForbiddenError);
    // opening:write passe outre la règle de pôle.
    await setChecklistItemStatus(dev, comptaItem.id, "EN_ATTENTE");
  });

  it("scoping franchisé + job opening-late idempotent", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({
      status: "EN_PROJET",
      franchiseeId: franchisee.id,
    });
    const other = await createTestStore({ status: "EN_PROJET" });

    const myProject = await createProject(dev, {
      storeId: mine.id,
      targetOpeningDate: null,
      notes: null,
    });
    const otherProject = await createProject(dev, {
      storeId: other.id,
      targetOpeningDate: null,
      notes: null,
    });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const visible = await listProjects(franchise);
    expect(visible.map((p) => p.id)).toEqual([myProject.id]);
    await expect(getProject(franchise, otherProject.id)).rejects.toThrow(
      ForbiddenError
    );

    // Jalon en retard → une alerte, puis plus rien au rejeu.
    const detail = await getProject(dev, myProject.id);
    await updateStep(dev, detail!.steps[0].id, {
      plannedDate: "2026-01-01",
      notes: null,
    });
    const first = await runOpeningLateJob();
    expect(first.late).toBe(1);
    expect(first.notified).toBeGreaterThan(0);
    const second = await runOpeningLateJob();
    expect(second.late).toBe(0);
    expect(second.notified).toBe(0);

    const devNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, dev.id),
    });
    expect(devNotifs.some((n) => n.type === "OUVERTURE")).toBe(true);

    // Le marqueur est bien posé sur le jalon.
    const step = await db.query.openingSteps.findFirst({
      where: eq(openingSteps.id, detail!.steps[0].id),
    });
    expect(step?.lateAlertSentAt).not.toBeNull();
  });
});
