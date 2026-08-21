import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addProspectEvent,
  changeProspectStatus,
  createAgent,
  createProspect,
  getProspect,
  listProspects,
} from "@/services/prospects.service";
import { createResale, listResales } from "@/services/resales.service";
import { createPremises, listPremises } from "@/services/premises.service";
import { runProspectFollowupJob } from "@/lib/jobs/prospect-followup";
import { resetDb } from "./setup/reset-db";
import { createTestStore, createTestUser } from "../helpers/factories";

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

const PROSPECT_BASE = {
  email: null,
  phone: null,
  city: null,
  targetZone: null,
  budget: null,
  personalContribution: null,
  leadSource: null,
  interestLevel: null,
  agentId: null,
  assigneeId: null,
  nextFollowUpDate: null,
  notes: null,
};

afterAll(async () => {
  await pool.end();
});

describe("prospection & cessions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("pipeline : changement de statut journalisé, module fermé aux autres rôles", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    const prospect = await createProspect(dev, {
      ...PROSPECT_BASE,
      firstName: "Karim",
      lastName: "Test",
    });
    expect(prospect.status).toBe("NOUVEAU");

    await changeProspectStatus(dev, prospect.id, "QUALIFIE", "Apport vérifié");
    await addProspectEvent(dev, prospect.id, {
      type: "RDV",
      eventDate: "2026-08-20",
      notes: "RDV au siège.",
    });

    const detail = await getProspect(dev, prospect.id);
    expect(detail?.status).toBe("QUALIFIE");
    // 2 événements : le STATUT auto-journalisé + le RDV.
    expect(detail?.events).toHaveLength(2);
    const statusEvent = detail?.events.find((e) => e.type === "STATUT");
    expect(statusEvent?.notes).toContain("Nouveau → Qualifié");
    expect(statusEvent?.notes).toContain("Apport vérifié");

    // Modules fermés hors développement/direction.
    await expect(listProspects(animateur)).rejects.toThrow(ForbiddenError);
    await expect(listPremises(animateur)).rejects.toThrow(ForbiddenError);
    await expect(listResales(animateur)).rejects.toThrow(ForbiddenError);
    await expect(
      changeProspectStatus(animateur, prospect.id, "ABANDONNE")
    ).rejects.toThrow(ForbiddenError);
  });

  it("cessions : réservées aux franchises ; locaux et agents créés par le pôle", async () => {
    const dev = asSession(
      await createTestUser({ role: "DEVELOPPEMENT", pole: "DEVELOPPEMENT" })
    );

    const branch = await createTestStore({ type: "SUCCURSALE" });
    await expect(
      createResale(dev, {
        storeId: branch.id,
        wish: "VENTE_TOTALE",
        askingPrice: null,
        urgency: "NORMALE",
        status: "ACTIVE",
        notes: null,
      })
    ).rejects.toThrow(/franchisée/);

    const store = await createTestStore();
    const resale = await createResale(dev, {
      storeId: store.id,
      wish: "RECHERCHE_ASSOCIE",
      askingPrice: "120000.00",
      urgency: "NORMALE",
      status: "ACTIVE",
      notes: "Confidentiel.",
    });
    expect(resale.askingPrice).toBe("120000.00");

    const agent = await createAgent(dev, {
      name: "Agence Test",
      agency: null,
      email: null,
      phone: null,
      zone: null,
      notes: null,
    });
    const local = await createPremises(dev, {
      address: "1 rue du Test",
      city: "Lyon",
      postalCode: null,
      surfaceM2: "85.5",
      monthlyRent: "2400.00",
      leaseRights: null,
      status: "DISPONIBLE",
      agentId: agent.id,
      notes: null,
    });
    expect(local.surfaceM2).toBe("85.5");
  });

  it("job prospect-followup : relance due notifiée une fois par jour", async () => {
    const dev = await createTestUser({
      role: "DEVELOPPEMENT",
      pole: "DEVELOPPEMENT",
    });
    const devSession = asSession(dev);

    await createProspect(devSession, {
      ...PROSPECT_BASE,
      firstName: "En",
      lastName: "Retard",
      assigneeId: dev.id,
      nextFollowUpDate: "2026-01-01",
    });
    await createProspect(devSession, {
      ...PROSPECT_BASE,
      firstName: "Plus",
      lastName: "Tard",
      nextFollowUpDate: "2099-01-01",
    });

    const first = await runProspectFollowupJob();
    expect(first.due).toBe(1);
    expect(first.notified).toBeGreaterThan(0);
    // Rejoué le même jour : dedupeKey par jour → aucune nouvelle notification.
    const second = await runProspectFollowupJob();
    expect(second.due).toBe(1);
    expect(second.notified).toBe(0);

    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, dev.id),
    });
    expect(notifs.filter((n) => n.type === "DEVELOPPEMENT")).toHaveLength(1);
  });
});
