import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  addMessage,
  createExchange,
  getExchange,
  listExchanges,
  setExchangeStatus,
} from "@/services/exchanges.service";
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
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
  };
}

function pdfFile(name = "piece.pdf"): File {
  return new File([Buffer.from("%PDF-1.4 piece jointe de test")], name, {
    type: "application/pdf",
  });
}

describe("service échanges franchisés", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("un franchisé ne liste que les échanges de ses boutiques", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const mine = await createTestFranchisee();
    const other = await createTestFranchisee();
    const myStore = await createTestStore({ franchiseeId: mine.id });
    const otherStore = await createTestStore({ franchiseeId: other.id });

    await createExchange(admin, {
      storeId: myStore.id,
      type: "DEMANDE",
      subject: "Échange visible",
      body: "Bonjour",
    });
    await createExchange(admin, {
      storeId: otherStore.id,
      type: "LITIGE",
      subject: "Échange invisible",
      body: "Bonjour",
    });

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: mine.id })
    );
    const visible = await listExchanges(franchise);
    expect(visible.map((e) => e.subject)).toEqual(["Échange visible"]);
    expect(visible[0].store.id).toBe(myStore.id);
    expect(visible[0].messageCount).toBe(1);
    expect(visible[0].lastMessageAt).toBeInstanceOf(Date);

    // L'admin voit tout, du plus récent au plus ancien.
    const all = await listExchanges(admin);
    expect(all.map((e) => e.subject)).toEqual([
      "Échange invisible",
      "Échange visible",
    ]);
  });

  it("getExchange exclut les notes internes pour un FRANCHISE et les garde pour un ADMIN", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const admin = asSession(await createTestUser({ role: "ADMIN" }));

    const exchange = await createExchange(franchise, {
      storeId: store.id,
      type: "DEMANDE",
      subject: "Question terrasse",
      body: "Peut-on installer une terrasse ?",
      files: [pdfFile("plan.pdf")],
    });
    await addMessage(admin, exchange.id, {
      body: "Note interne : vérifier le bail avant de répondre.",
      isInternal: true,
    });
    await addMessage(admin, exchange.id, {
      body: "Réponse publique : oui sous conditions.",
      isDecision: true,
    });

    const forAdmin = await getExchange(admin, exchange.id);
    expect(forAdmin?.messages).toHaveLength(3);
    expect(forAdmin?.messages.map((m) => m.isInternal)).toEqual([
      false,
      true,
      false,
    ]);
    // PJ du premier message présente avec son nom d'origine
    expect(forAdmin?.messages[0].attachments.map((a) => a.originalName)).toEqual([
      "plan.pdf",
    ]);

    // Le franchisé ne reçoit JAMAIS la note interne dans le payload.
    const forFranchise = await getExchange(franchise, exchange.id);
    expect(forFranchise?.messages).toHaveLength(2);
    expect(JSON.stringify(forFranchise)).not.toContain("Note interne : vérifier");
    // Le décompte de la liste exclut aussi la note interne.
    const list = await listExchanges(franchise);
    expect(list[0].messageCount).toBe(2);
  });

  it("un FRANCHISE ne peut pas poser isDecision/isInternal ni changer le statut", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const exchange = await createExchange(franchise, {
      storeId: store.id,
      type: "DEMANDE",
      subject: "Tentative",
      body: "Premier message",
    });
    const message = await addMessage(franchise, exchange.id, {
      body: "Je décide tout seul",
      isDecision: true,
      isInternal: true,
    });
    expect(message.isDecision).toBe(false);
    expect(message.isInternal).toBe(false);

    await expect(
      setExchangeStatus(franchise, exchange.id, "RESOLU")
    ).rejects.toThrow(ForbiddenError);
  });

  it("hors périmètre : un franchisé ne peut ni lire ni créer sur une autre boutique", async () => {
    const franchisee = await createTestFranchisee();
    const otherStore = await createTestStore();
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const exchange = await createExchange(admin, {
      storeId: otherStore.id,
      type: "INFORMATION",
      subject: "Hors périmètre",
      body: "Interne réseau",
    });
    await expect(getExchange(franchise, exchange.id)).rejects.toThrow(
      ForbiddenError
    );
    await expect(
      createExchange(franchise, {
        storeId: otherStore.id,
        type: "DEMANDE",
        subject: "Interdit",
        body: "Interdit",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("réponse siège → notifie les comptes franchisés et le créateur, jamais l'auteur", async () => {
    const animateur = await createTestUser({ role: "ANIMATION" });
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({
      franchiseeId: franchisee.id,
      animateurId: animateur.id,
    });
    const creator = await createTestUser({
      role: "FRANCHISE",
      franchiseeId: franchisee.id,
    });
    const otherFranchiseUser = await createTestUser({
      role: "FRANCHISE",
      franchiseeId: franchisee.id,
    });
    const admin = await createTestUser({ role: "ADMIN" });

    const exchange = await createExchange(asSession(creator), {
      storeId: store.id,
      type: "DEMANDE",
      subject: "Notifications",
      body: "Première demande",
    });
    // La création notifie l'animateur et les ADMIN/DIRECTION actifs.
    const creationNotifs = await db.query.notifications.findMany({
      where: eq(notifications.title, "Nouvel échange : Notifications"),
    });
    expect(creationNotifs.map((n) => n.userId).sort()).toEqual(
      [admin.id, animateur.id].sort()
    );
    expect(creationNotifs[0].link).toBe(`/echanges/${exchange.id}`);

    await addMessage(asSession(admin), exchange.id, {
      body: "Réponse publique du siège",
    });
    const replyNotifs = await db.query.notifications.findMany({
      where: eq(notifications.title, "Nouveau message : Notifications"),
    });
    expect(replyNotifs.map((n) => n.userId).sort()).toEqual(
      [creator.id, otherFranchiseUser.id].sort()
    );
    // L'auteur (admin) n'est pas notifié de sa propre réponse.
    expect(replyNotifs.map((n) => n.userId)).not.toContain(admin.id);

    // Une note interne ne notifie personne.
    await addMessage(asSession(admin), exchange.id, {
      body: "Note interne silencieuse",
      isInternal: true,
    });
    const afterInternal = await db.query.notifications.findMany({
      where: eq(notifications.title, "Nouveau message : Notifications"),
    });
    expect(afterInternal).toHaveLength(replyNotifs.length);

    // Réponse du franchisé → animateur + créateur (sauf auteur).
    await addMessage(asSession(otherFranchiseUser), exchange.id, {
      body: "Merci pour la réponse",
    });
    const afterFranchiseReply = await db.query.notifications.findMany({
      where: eq(notifications.title, "Nouveau message : Notifications"),
    });
    const newOnes = afterFranchiseReply.filter(
      (n) => !replyNotifs.some((p) => p.id === n.id)
    );
    expect(newOnes.map((n) => n.userId).sort()).toEqual(
      [animateur.id, creator.id].sort()
    );
  });

  it("refuse toute réponse sur un échange CLOS", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const exchange = await createExchange(franchise, {
      storeId: store.id,
      type: "LITIGE",
      subject: "À clore",
      body: "Litige réglé",
    });
    const closed = await setExchangeStatus(admin, exchange.id, "CLOS");
    expect(closed.closedAt).toBeInstanceOf(Date);

    await expect(
      addMessage(franchise, exchange.id, { body: "Trop tard" })
    ).rejects.toThrow(/Échange clos/);
    await expect(
      addMessage(admin, exchange.id, { body: "Trop tard aussi" })
    ).rejects.toThrow(/Échange clos/);

    // Réouverture : closedAt repasse à null.
    const reopened = await setExchangeStatus(admin, exchange.id, "EN_COURS");
    expect(reopened.closedAt).toBeNull();
  });

  it("la première réponse d'un rôle siège passe l'échange OUVERT → EN_COURS", async () => {
    const franchisee = await createTestFranchisee();
    const store = await createTestStore({ franchiseeId: franchisee.id });
    const animation = asSession(await createTestUser({ role: "ANIMATION" }));
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );

    const exchange = await createExchange(franchise, {
      storeId: store.id,
      type: "DEMANDE",
      subject: "Statut auto",
      body: "Demande initiale",
    });
    expect(exchange.status).toBe("OUVERT");

    // Une réponse du franchisé lui-même ne change pas le statut.
    await addMessage(franchise, exchange.id, { body: "Complément" });
    expect((await getExchange(franchise, exchange.id))?.status).toBe("OUVERT");

    await addMessage(animation, exchange.id, { body: "On regarde ça" });
    expect((await getExchange(animation, exchange.id))?.status).toBe("EN_COURS");
  });
});
