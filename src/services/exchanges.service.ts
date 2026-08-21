import "server-only";

import { and, asc, count, desc, eq, inArray, max, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { exchangeMessages, exchanges, fileAttachments, stores, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type ExchangeInsert = typeof exchanges.$inferInsert;

export type ExchangeType = ExchangeInsert["type"];
export type ExchangeStatus = NonNullable<ExchangeInsert["status"]>;

export type ExchangeFilters = {
  storeId?: string;
  type?: ExchangeType;
  status?: ExchangeStatus;
};

// Rôles « siège » = tous les rôles non franchisés.
function isSiege(actor: SessionUser): boolean {
  return actor.role !== "FRANCHISE";
}

// Liste des échanges, du plus récent au plus ancien, avec la boutique et un
// résumé du fil (nombre de messages + date du dernier). Pour un franchisé,
// les notes internes sont exclues du décompte comme du reste du payload.
export async function listExchanges(actor: SessionUser, filters: ExchangeFilters = {}) {
  assertCan(actor, "exchange:read");
  const conditions: SQL[] = [];

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(exchanges.storeId, scoped));
  }
  if (filters.storeId) conditions.push(eq(exchanges.storeId, filters.storeId));
  if (filters.type) conditions.push(eq(exchanges.type, filters.type));
  if (filters.status) conditions.push(eq(exchanges.status, filters.status));

  const rows = await db.query.exchanges.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(exchanges.createdAt)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  if (rows.length === 0) return [];

  const messageConditions: SQL[] = [
    inArray(
      exchangeMessages.exchangeId,
      rows.map((r) => r.id)
    ),
  ];
  if (!isSiege(actor)) {
    messageConditions.push(eq(exchangeMessages.isInternal, false));
  }
  const stats = await db
    .select({
      exchangeId: exchangeMessages.exchangeId,
      messageCount: count(),
      lastMessageAt: max(exchangeMessages.createdAt),
    })
    .from(exchangeMessages)
    .where(and(...messageConditions))
    .groupBy(exchangeMessages.exchangeId);
  const byExchange = new Map(stats.map((s) => [s.exchangeId, s]));

  return rows.map((row) => ({
    ...row,
    messageCount: byExchange.get(row.id)?.messageCount ?? 0,
    lastMessageAt: byExchange.get(row.id)?.lastMessageAt ?? null,
  }));
}

// Fil complet d'un échange : messages chronologiques avec auteur et pièces
// jointes. Les notes internes sont ABSENTES du payload pour un franchisé
// (règle CLAUDE.md n°4 — jamais masquées seulement en CSS).
export async function getExchange(actor: SessionUser, exchangeId: string) {
  assertCan(actor, "exchange:read");
  const exchange = await db.query.exchanges.findFirst({
    where: eq(exchanges.id, exchangeId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
      messages: {
        where: isSiege(actor) ? undefined : eq(exchangeMessages.isInternal, false),
        orderBy: [asc(exchangeMessages.createdAt)],
        with: {
          author: { columns: { id: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });
  if (!exchange) return null;
  await assertStoreAccess(actor, exchange.storeId);

  const messageIds = exchange.messages.map((m) => m.id);
  const attachments = messageIds.length
    ? await db.query.fileAttachments.findMany({
        where: and(
          eq(fileAttachments.entityType, "EXCHANGE_MESSAGE"),
          inArray(fileAttachments.entityId, messageIds)
        ),
        columns: { id: true, originalName: true, entityId: true },
      })
    : [];
  const byMessage = new Map<string, { id: string; originalName: string }[]>();
  for (const file of attachments) {
    if (!file.entityId) continue;
    const list = byMessage.get(file.entityId) ?? [];
    list.push({ id: file.id, originalName: file.originalName });
    byMessage.set(file.entityId, list);
  }

  return {
    ...exchange,
    messages: exchange.messages.map((m) => ({
      ...m,
      attachments: byMessage.get(m.id) ?? [],
    })),
  };
}

// Destinataires siège d'un nouvel échange : ADMIN + DIRECTION actifs.
async function activeHeadOfficeUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ["ADMIN", "DIRECTION"]), eq(users.isActive, true)));
  return rows.map((r) => r.id);
}

// Comptes FRANCHISE actifs rattachés au franchisé d'une boutique.
async function franchiseUserIds(franchiseeId: string | null): Promise<string[]> {
  if (!franchiseeId) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "FRANCHISE"),
        eq(users.franchiseeId, franchiseeId),
        eq(users.isActive, true)
      )
    );
  return rows.map((r) => r.id);
}

export async function createExchange(
  actor: SessionUser,
  input: {
    storeId: string;
    type: ExchangeType;
    subject: string;
    body: string;
    files?: File[];
  }
) {
  assertCan(actor, "exchange:write");
  await assertStoreAccess(actor, input.storeId);
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });
  if (!store) throw new Error("Boutique introuvable.");

  const exchange = await auditedInsert({ id: actor.id }, exchanges, {
    storeId: input.storeId,
    type: input.type,
    subject: input.subject,
    createdById: actor.id,
  });
  const message = await auditedInsert({ id: actor.id }, exchangeMessages, {
    exchangeId: exchange.id,
    authorId: actor.id,
    body: input.body,
  });
  for (const file of input.files ?? []) {
    await saveUpload(actor, file, {
      entityType: "EXCHANGE_MESSAGE",
      entityId: message.id,
    });
  }

  const recipients = [...(await activeHeadOfficeUserIds())];
  if (store.animateurId) recipients.push(store.animateurId);
  await notify(
    recipients.filter((id) => id !== actor.id),
    {
      type: "ECHANGE",
      title: `Nouvel échange : ${input.subject}`,
      body: `${store.code} — ${store.name}`,
      link: `/echanges/${exchange.id}`,
    }
  );

  return exchange;
}

export async function addMessage(
  actor: SessionUser,
  exchangeId: string,
  input: {
    body: string;
    isDecision?: boolean;
    isInternal?: boolean;
    files?: File[];
  }
) {
  assertCan(actor, "exchange:write");
  const exchange = await db.query.exchanges.findFirst({
    where: eq(exchanges.id, exchangeId),
    with: { store: true },
  });
  if (!exchange) throw new Error("Échange introuvable.");
  await assertStoreAccess(actor, exchange.storeId);
  if (exchange.status === "CLOS") throw new Error("Échange clos.");

  // Un franchisé ne peut JAMAIS poser une décision ni une note interne.
  const siege = isSiege(actor);
  const isDecision = siege ? (input.isDecision ?? false) : false;
  const isInternal = siege ? (input.isInternal ?? false) : false;

  const message = await auditedInsert({ id: actor.id }, exchangeMessages, {
    exchangeId,
    authorId: actor.id,
    body: input.body,
    isDecision,
    isInternal,
  });
  for (const file of input.files ?? []) {
    await saveUpload(actor, file, {
      entityType: "EXCHANGE_MESSAGE",
      entityId: message.id,
    });
  }

  // Première réponse d'un rôle siège : l'échange passe OUVERT → EN_COURS.
  if (siege && exchange.status === "OUVERT") {
    await auditedUpdate({ id: actor.id }, exchanges, exchangeId, {
      status: "EN_COURS",
    });
  }

  const recipients: string[] = [];
  if (siege) {
    // Réponse publique du siège → les comptes franchisés de la boutique
    // + le créateur de l'échange. Une note interne ne notifie personne.
    if (!isInternal) {
      recipients.push(...(await franchiseUserIds(exchange.store.franchiseeId)));
      recipients.push(exchange.createdById);
    }
  } else {
    // Réponse d'un franchisé → l'animateur de la boutique + le créateur.
    if (exchange.store.animateurId) recipients.push(exchange.store.animateurId);
    recipients.push(exchange.createdById);
  }
  await notify(
    recipients.filter((id) => id !== actor.id),
    {
      type: "ECHANGE",
      title: `Nouveau message : ${exchange.subject}`,
      body: `${exchange.store.code} — ${exchange.store.name}`,
      link: `/echanges/${exchangeId}`,
    }
  );

  return message;
}

// Changement de statut : réservé aux rôles siège. CLOS pose closedAt ;
// toute réouverture le remet à null.
export async function setExchangeStatus(
  actor: SessionUser,
  exchangeId: string,
  status: ExchangeStatus
) {
  assertCan(actor, "exchange:write");
  if (!isSiege(actor)) {
    throw new ForbiddenError("Le changement de statut est réservé au siège.");
  }
  const exchange = await db.query.exchanges.findFirst({
    where: eq(exchanges.id, exchangeId),
  });
  if (!exchange) throw new Error("Échange introuvable.");

  return auditedUpdate({ id: actor.id }, exchanges, exchangeId, {
    status,
    closedAt: status === "CLOS" ? new Date() : null,
  });
}
