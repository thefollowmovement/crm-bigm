import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createCriterion,
  createVisit,
  finalizeVisit,
  getAuditTrends,
  getVisit,
  setAuditItem,
  updateVisitReport,
} from "@/services/visits.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestCriterion,
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

describe("visites terrain", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cycle complet d'un audit : création, notation, compte rendu, finalisation", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const store = await createTestStore();
    const c1 = await createTestCriterion({ maxScore: 10 });
    const c2 = await createTestCriterion({ maxScore: 20 });

    const visit = await createVisit(animateur, {
      storeId: store.id,
      type: "AUDIT",
      visitDate: "2026-08-10",
      report: null,
    });
    expect(visit.status).toBe("BROUILLON");

    // Note hors barème refusée.
    await expect(
      setAuditItem(animateur, visit.id, {
        criterionId: c1.id,
        score: 11,
        isCompliant: true,
        comment: null,
      })
    ).rejects.toThrow(/Note invalide/);

    await setAuditItem(animateur, visit.id, {
      criterionId: c1.id,
      score: 8,
      isCompliant: true,
      comment: null,
    });
    // Re-saisie du même critère : écrase sans dupliquer.
    await setAuditItem(animateur, visit.id, {
      criterionId: c1.id,
      score: 9,
      isCompliant: true,
      comment: null,
    });
    await setAuditItem(animateur, visit.id, {
      criterionId: c2.id,
      score: 10,
      isCompliant: false,
      comment: "Non-conformité relevée.",
    });

    // Compte rendu obligatoire pour finaliser.
    await expect(finalizeVisit(animateur, visit.id)).rejects.toThrow(
      /compte rendu/i
    );
    await updateVisitReport(animateur, visit.id, "RAS globalement.");
    const finalized = await finalizeVisit(animateur, visit.id);
    expect(finalized.status).toBe("FINALISEE");

    const detail = await getVisit(animateur, visit.id);
    expect(detail?.items).toHaveLength(2);
    expect(detail?.items.find((i) => i.criterionId === c1.id)?.score).toBe(9);

    // Une visite finalisée n'est plus modifiable.
    await expect(
      setAuditItem(animateur, visit.id, {
        criterionId: c1.id,
        score: 5,
        isCompliant: true,
        comment: null,
      })
    ).rejects.toThrow(/finalisée/i);
  });

  it("un audit sans critère noté ne peut pas être finalisé ; un autre animateur non plus", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const intrus = asSession(await createTestUser({ role: "ANIMATION" }));
    const store = await createTestStore();

    const visit = await createVisit(animateur, {
      storeId: store.id,
      type: "AUDIT",
      visitDate: "2026-08-10",
      report: "CR présent.",
    });
    await expect(finalizeVisit(animateur, visit.id)).rejects.toThrow(
      /au moins un critère/i
    );
    await expect(updateVisitReport(intrus, visit.id, "piratage")).rejects.toThrow(
      ForbiddenError
    );
  });

  it("la grille (référentiel) est réservée à la direction et les tendances agrègent par mois", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    await expect(
      createCriterion(animateur, { label: "Interdit", category: null, maxScore: 10 })
    ).rejects.toThrow(ForbiddenError);

    const criterion = await createCriterion(direction, {
      label: "Hygiène",
      category: "Hygiène",
      maxScore: 10,
    });
    const store = await createTestStore();
    const visit = await createVisit(animateur, {
      storeId: store.id,
      type: "AUDIT",
      visitDate: "2026-08-05",
      report: "OK",
    });
    await setAuditItem(animateur, visit.id, {
      criterionId: criterion.id,
      score: 7,
      isCompliant: false,
      comment: null,
    });
    await finalizeVisit(animateur, visit.id);

    // Une visite en brouillon ne compte pas dans les tendances.
    const draft = await createVisit(animateur, {
      storeId: store.id,
      type: "AUDIT",
      visitDate: "2026-08-06",
      report: "brouillon",
    });
    await setAuditItem(animateur, draft.id, {
      criterionId: criterion.id,
      score: 1,
      isCompliant: false,
      comment: null,
    });

    const trends = await getAuditTrends(direction, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(trends).toEqual([
      { month: "2026-08", scorePct: "70.0", nonCompliantCount: 1, auditCount: 1 },
    ]);
  });
});
