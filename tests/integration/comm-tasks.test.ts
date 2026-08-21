import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addCommTaskComment,
  assignCommTask,
  createCommTask,
  getCommTask,
  listCommTasks,
  transitionCommTask,
} from "@/services/comm-tasks.service";
import {
  createPartner,
  getPartner,
  listPartners,
  setPartnerStores,
} from "@/services/partners.service";
import { runCommTaskOverdueJob } from "@/lib/jobs/comm-task-overdue";
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

describe("tâches communication", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cycle : demande franchisé → affectation → terminé → validation du demandeur", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const com = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );

    // Le franchisé ne crée qu'une DEMANDE.
    await expect(
      createCommTask(franchise, {
        type: "CAMPAGNE",
        title: "Interdit",
        description: null,
        storeId: store.id,
        partnerId: null,
        priority: "NORMALE",
        dueDate: null,
        publicationDate: null,
        files: [],
      })
    ).rejects.toThrow(ForbiddenError);

    const task = await createCommTask(franchise, {
      type: "DEMANDE",
      title: "Affiche promo locale",
      description: "Besoin d'une affiche pour l'ouverture du samedi.",
      storeId: store.id,
      partnerId: null,
      priority: "NORMALE",
      dueDate: null,
      publicationDate: null,
      files: [],
    });

    await assignCommTask(com, task.id, com.id);
    await transitionCommTask(com, task.id, "EN_COURS");
    await transitionCommTask(com, task.id, "TERMINE");

    // Le pôle ne valide pas ; le demandeur (franchisé, sans écriture) si.
    await expect(transitionCommTask(com, task.id, "VALIDE")).rejects.toThrow(
      ForbiddenError
    );
    const validated = await transitionCommTask(franchise, task.id, "VALIDE");
    expect(validated.status).toBe("VALIDE");

    await addCommTaskComment(franchise, task.id, "Parfait, merci !");
    const detail = await getCommTask(franchise, task.id);
    expect(detail?.comments).toHaveLength(1);
  });

  it("le franchisé ne voit que ses boutiques ou ses demandes ; le job de retard est idempotent", async () => {
    const com = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();

    await createCommTask(com, {
      type: "CAMPAGNE",
      title: "Pour ma boutique",
      description: null,
      storeId: mine.id,
      partnerId: null,
      priority: "NORMALE",
      dueDate: "2026-01-01", // largement dépassée
      publicationDate: null,
      files: [],
    });
    await createCommTask(com, {
      type: "CAMPAGNE",
      title: "Ailleurs",
      description: null,
      storeId: other.id,
      partnerId: null,
      priority: "NORMALE",
      dueDate: null,
      publicationDate: null,
      files: [],
    });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const list = await listCommTasks(franchise);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Pour ma boutique");

    const first = await runCommTaskOverdueJob();
    expect(first.reminded).toBe(1);
    expect(first.notified).toBeGreaterThan(0);
    const second = await runCommTaskOverdueJob();
    expect(second.reminded).toBe(0);
    expect(second.notified).toBe(0);
  });

  it("fiche partenaire : notes internes réservées à l'écriture, boutiques liées", async () => {
    const com = asSession(
      await createTestUser({ role: "COMMUNICATION", pole: "COMMUNICATION" })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const store = await createTestStore();

    const partner = await createPartner(com, {
      companyName: "Studio Test",
      contactName: null,
      phone: null,
      email: null,
      domain: "Print",
      tariffNotes: null,
      scopeNotes: null,
      internalNotes: "Remise confidentielle.",
    });
    await setPartnerStores(com, partner.id, [store.id]);

    // L'animation lit la fiche SANS les notes internes.
    const forAnimation = await listPartners(animateur);
    expect(forAnimation[0].companyName).toBe("Studio Test");
    expect("internalNotes" in forAnimation[0]).toBe(false);

    const detail = await getPartner(animateur, partner.id);
    expect(detail?.stores.map((s) => s.id)).toEqual([store.id]);
    expect(detail && "internalNotes" in detail).toBe(false);

    // Le pôle communication les voit.
    const forCom = await getPartner(com, partner.id);
    expect(forCom?.internalNotes).toBe("Remise confidentielle.");

    // Écriture réservée.
    await expect(
      createPartner(animateur, {
        companyName: "Interdit",
        contactName: null,
        phone: null,
        email: null,
        domain: null,
        tariffNotes: null,
        scopeNotes: null,
        internalNotes: null,
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
