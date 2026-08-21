import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db/client";
import { trainingDocuments } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addParticipant,
  createTraining,
  getTraining,
  listSignedDocsForFranchisee,
  listSignedDocsForStore,
  listTrainings,
  transitionTraining,
  updateTrainingReport,
} from "@/services/trainings.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFile,
  createTestFranchisee,
  createTestStore,
  createTestTraining,
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

describe("formations", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cycle complet : planifiée (rattachée au franchisé), CR obligatoire, validation RH", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const rh = asSession(await createTestUser({ role: "RH" }));
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });

    const training = await createTraining(animateur, {
      storeId: store.id,
      type: "HYGIENE",
      trainingDate: "2026-08-20",
      trainerId: null,
      notes: null,
    });
    // rattachement automatique au franchisé de la boutique
    expect(training.franchiseeId).toBe(franchisee.id);
    expect(training.trainerId).toBe(animateur.id);

    // Sans compte rendu : refus.
    await expect(
      transitionTraining(animateur, training.id, "REALISEE")
    ).rejects.toThrow(/compte rendu/i);

    await updateTrainingReport(animateur, training.id, {
      report: "Formation dispensée, points acquis.",
      notes: null,
    });
    await addParticipant(animateur, training.id, "Karim");
    await transitionTraining(animateur, training.id, "REALISEE");

    // Le formateur ne valide pas lui-même ; la RH oui.
    await expect(
      transitionTraining(animateur, training.id, "VALIDEE")
    ).rejects.toThrow(ForbiddenError);
    const validated = await transitionTraining(rh, training.id, "VALIDEE");
    expect(validated.status).toBe("VALIDEE");
    expect(validated.validatedById).toBe(rh.id);

    const detail = await getTraining(rh, training.id);
    expect(detail?.participants).toHaveLength(1);
  });

  it("les documents signés remontent sur la boutique et le franchisé, scopés", async () => {
    const rh = asSession(await createTestUser({ role: "RH" }));
    const franchisee = await createTestFranchisee();
    const otherFranchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });

    const training = await createTestTraining(store.id, {
      franchiseeId: franchisee.id,
      status: "REALISEE",
      report: "OK",
    });
    const signedFile = await createTestFile({
      entityType: "TRAINING",
      entityId: training.id,
      originalName: "attestation-signee.pdf",
    });
    const givenFile = await createTestFile({
      entityType: "TRAINING",
      entityId: training.id,
      originalName: "support-cours.pdf",
    });
    await db.insert(trainingDocuments).values([
      { trainingId: training.id, fileId: signedFile.id, kind: "SIGNE" },
      { trainingId: training.id, fileId: givenFile.id, kind: "REMIS" },
    ]);

    const forStore = await listSignedDocsForStore(rh, store.id);
    expect(forStore).toHaveLength(1);
    expect(forStore[0].originalName).toBe("attestation-signee.pdf");

    const forFranchisee = await listSignedDocsForFranchisee(rh, franchisee.id);
    expect(forFranchisee).toHaveLength(1);

    // Le franchisé lit les siens, pas ceux d'un autre.
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    expect(await listSignedDocsForFranchisee(franchise, franchisee.id)).toHaveLength(1);
    await expect(
      listSignedDocsForFranchisee(franchise, otherFranchisee.id)
    ).rejects.toThrow(ForbiddenError);
  });

  it("le franchisé ne liste que les formations de ses boutiques et ne crée pas", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    await createTestTraining(mine.id, { trainerId: animateur.id });
    await createTestTraining(other.id, { trainerId: animateur.id });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const list = await listTrainings(franchise);
    expect(list).toHaveLength(1);
    expect(list[0].store.id).toBe(mine.id);

    await expect(
      createTraining(franchise, {
        storeId: mine.id,
        type: "AUTRE",
        trainingDate: "2026-08-21",
        trainerId: null,
        notes: null,
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
