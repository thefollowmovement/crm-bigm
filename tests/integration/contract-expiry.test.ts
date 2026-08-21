import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { contracts, notifications } from "@/db/schema";
import { runContractExpiryJob } from "@/lib/jobs/contract-expiry";
import { notify } from "@/services/notifications.service";
import { addMonthsIso, todayParis } from "@/lib/dates";
import { resetDb } from "./setup/reset-db";
import {
  createTestContract,
  createTestStore,
  createTestUser,
} from "../helpers/factories";

afterAll(async () => {
  await pool.end();
});

describe("notifications idempotentes", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("la même dedupeKey n'est délivrée qu'une fois par utilisateur", async () => {
    const user = await createTestUser();
    const first = await notify([user.id], {
      type: "SYSTEME",
      title: "Test",
      dedupeKey: "clef-1",
    });
    const second = await notify([user.id], {
      type: "SYSTEME",
      title: "Test bis",
      dedupeKey: "clef-1",
    });
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(await db.query.notifications.findMany()).toHaveLength(1);
  });

  it("sans dedupeKey, chaque envoi est délivré", async () => {
    const user = await createTestUser();
    await notify([user.id], { type: "SYSTEME", title: "A" });
    await notify([user.id], { type: "SYSTEME", title: "B" });
    expect(await db.query.notifications.findMany()).toHaveLength(2);
  });
});

describe("job d'alerte de fin de contrat", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("alerte les bons destinataires et reste idempotent sur deux exécutions", async () => {
    const direction = await createTestUser({ role: "DIRECTION" });
    const animateur = await createTestUser({ role: "ANIMATION" });
    // un rôle non concerné ne doit rien recevoir
    const compta = await createTestUser({ role: "COMPTABILITE" });

    const store = await createTestStore({ animateurId: animateur.id });
    const today = todayParis();
    const contract = await createTestContract(store.id, {
      endDate: addMonthsIso(today, 3), // dans la fenêtre de 6 mois
    });

    const first = await runContractExpiryJob();
    expect(first.alerted).toBe(1);

    const second = await runContractExpiryJob();
    expect(second.alerted).toBe(0);

    const all = await db.query.notifications.findMany();
    const recipients = all.map((n) => n.userId).sort();
    expect(recipients).toEqual([direction.id, animateur.id].sort());
    expect(all.every((n) => n.dedupeKey === `contract-expiry:${contract.id}`)).toBe(true);
    expect(all.some((n) => n.userId === compta.id)).toBe(false);

    const [updated] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contract.id));
    expect(updated.expiryAlertSentAt).not.toBeNull();
  });

  it("ignore les contrats hors fenêtre, sans échéance ou non actifs", async () => {
    const store = await createTestStore();
    await createTestUser({ role: "DIRECTION" });
    const today = todayParis();

    await createTestContract(store.id, { endDate: addMonthsIso(today, 12) });
    await createTestContract(store.id, { endDate: null });
    await createTestContract(store.id, {
      endDate: addMonthsIso(today, 1),
      status: "RESILIE",
    });

    const result = await runContractExpiryJob();
    expect(result.alerted).toBe(0);
    expect(await db.query.notifications.findMany()).toHaveLength(0);
  });

  it("respecte le délai personnalisé du contrat", async () => {
    const store = await createTestStore();
    await createTestUser({ role: "DIRECTION" });
    const today = todayParis();

    // échéance dans 3 mois mais alerte demandée 2 mois avant : pas encore
    await createTestContract(store.id, {
      endDate: addMonthsIso(today, 3),
      alertMonthsBefore: 2,
    });

    const result = await runContractExpiryJob();
    expect(result.alerted).toBe(0);
  });

  it("une échéance modifiée réarme l'alerte", async () => {
    const direction = await createTestUser({ role: "DIRECTION" });
    const admin = await createTestUser({ role: "ADMIN" });
    const store = await createTestStore();
    const today = todayParis();
    const contract = await createTestContract(store.id, {
      endDate: addMonthsIso(today, 2),
    });

    await runContractExpiryJob();
    expect((await db.query.notifications.findMany()).length).toBeGreaterThan(0);

    // renouvellement : nouvelle échéance lointaine → puis de nouveau proche
    const { updateContract } = await import("@/services/contracts.service");
    const actor = {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      pole: admin.pole,
      franchiseeId: admin.franchiseeId,
    };
    await updateContract(actor, contract.id, { endDate: addMonthsIso(today, 4) });

    const rerun = await runContractExpiryJob();
    expect(rerun.alerted).toBe(1);
    // nouvelle notification pour la même personne : la dedupeKey est la même,
    // donc pas de doublon — le contrat est simplement re-marqué
    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, direction.id),
    });
    expect(notifs).toHaveLength(1);
  });
});
