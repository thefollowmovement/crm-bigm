import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addTicketComment,
  assignTicket,
  createTicket,
  getTicket,
  listTickets,
  transitionTicket,
} from "@/services/tickets.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

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

const baseInput = {
  title: "Problème de caisse",
  description: "La caisse de la boutique ne synchronise plus.",
  toPole: "RH" as const,
  storeId: null,
  priority: "NORMALE" as const,
  dueDate: null,
  files: [] as File[],
};

afterAll(async () => {
  await pool.end();
});

describe("tickets inter-pôles", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("notifie le pôle destinataire à la création (pas l'auteur)", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh1 = await createTestUser({ role: "RH", pole: "RH" });
    const rh2 = await createTestUser({ role: "RH", pole: "RH" });
    // un membre inactif du pôle ne reçoit rien
    await createTestUser({ role: "RH", pole: "RH", isActive: false });

    await createTicket(compta, baseInput);

    const notifs = await db.query.notifications.findMany();
    expect(notifs.map((n) => n.userId).sort()).toEqual([rh1.id, rh2.id].sort());
  });

  it("suit le cycle complet avec validation réservée au demandeur", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));

    const ticket = await createTicket(compta, baseInput);
    expect(ticket.status).toBe("NOUVEAU");

    // affectation → AFFECTE + notification à l'assigné
    await assignTicket(rh, ticket.id, rh.id);
    let current = await getTicket(rh, ticket.id);
    expect(current?.status).toBe("AFFECTE");

    await transitionTicket(rh, ticket.id, "EN_COURS");
    await transitionTicket(rh, ticket.id, "EN_ATTENTE");
    await transitionTicket(rh, ticket.id, "EN_COURS");
    await transitionTicket(rh, ticket.id, "TERMINE");

    current = await getTicket(rh, ticket.id);
    expect(current?.status).toBe("TERMINE");
    expect(current?.completedAt).not.toBeNull();

    // l'exécutant ne peut pas valider…
    await expect(transitionTicket(rh, ticket.id, "VALIDE")).rejects.toThrow(
      ForbiddenError
    );
    // …le demandeur si
    await transitionTicket(compta, ticket.id, "VALIDE");
    current = await getTicket(compta, ticket.id);
    expect(current?.status).toBe("VALIDE");
    expect(current?.validatedAt).not.toBeNull();
  });

  it("rejette les transitions interdites", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const ticket = await createTicket(compta, baseInput);

    await expect(transitionTicket(compta, ticket.id, "VALIDE")).rejects.toThrow(
      /impossible/
    );
    await expect(transitionTicket(compta, ticket.id, "TERMINE")).rejects.toThrow(
      /impossible/
    );
  });

  it("le ticket terminé notifie le demandeur pour validation", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const ticket = await createTicket(compta, baseInput);
    await assignTicket(rh, ticket.id, rh.id);
    await transitionTicket(rh, ticket.id, "EN_COURS");

    await db.delete(notifications); // isole la notification de TERMINE
    await transitionTicket(rh, ticket.id, "TERMINE");

    const notifs = await db.query.notifications.findMany();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(compta.id);
    expect(notifs[0].title).toContain("à valider");
  });

  it("un commentaire notifie demandeur et assigné, sauf l'auteur", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const ticket = await createTicket(compta, baseInput);
    await assignTicket(rh, ticket.id, rh.id);

    await db.delete(notifications);
    await addTicketComment(rh, ticket.id, "Je m'en occupe demain matin.");

    const notifs = await db.query.notifications.findMany();
    expect(notifs.map((n) => n.userId)).toEqual([compta.id]);
  });

  it("filtre « mes tickets » et « mon pôle »", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );

    await createTicket(compta, baseInput); // compta → RH
    await createTicket(direction, { ...baseInput, toPole: "COMPTABILITE" });

    expect(await listTickets(rh, { view: "pole" })).toHaveLength(1);
    expect(await listTickets(compta, { view: "mine" })).toHaveLength(1);
    expect(await listTickets(compta, { view: "pole" })).toHaveLength(2);
    expect(await listTickets(direction, { view: "all" })).toHaveLength(2);
  });
});
