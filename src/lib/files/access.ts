import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contracts,
  documentVersions,
  exchangeMessages,
  fileAttachments,
  reminders,
  ticketComments,
  tickets,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { accessibleStoreIds } from "@/lib/authz/guards";

type Attachment = typeof fileAttachments.$inferSelect;

async function storeAllowed(user: SessionUser, storeId: string | null) {
  const scoped = await accessibleStoreIds(user);
  if (scoped === null) return true;
  return storeId !== null && scoped.includes(storeId);
}

// Décide si `user` peut télécharger ce fichier, selon l'entité parente.
// Retourne aussi si le téléchargement doit être audité (documents contractuels).
export async function canDownloadFile(
  user: SessionUser,
  attachment: Attachment
): Promise<{ allowed: boolean; audit: boolean }> {
  const deny = { allowed: false, audit: false };

  // 1. Version de la bibliothèque documentaire (relation directe)
  const version = await db.query.documentVersions.findFirst({
    where: eq(documentVersions.fileId, attachment.id),
    with: { document: true },
  });
  if (version) {
    if (!can(user, "document:read")) return deny;
    const roles = version.document.visibleToRoles;
    if (user.role === "FRANCHISE") {
      // Un franchisé ne voit que les documents explicitement partagés.
      if (!roles.includes("FRANCHISE")) return deny;
    } else if (roles.length > 0 && !roles.includes(user.role)) {
      return deny;
    }
    return { allowed: true, audit: true };
  }

  // 2. Rattachement polymorphe
  switch (attachment.entityType) {
    case "CONTRACT": {
      if (!can(user, "contract:read")) return deny;
      const contract = await db.query.contracts.findFirst({
        where: eq(contracts.id, attachment.entityId ?? ""),
      });
      if (!contract || !(await storeAllowed(user, contract.storeId))) return deny;
      return { allowed: true, audit: true };
    }
    case "EXCHANGE_MESSAGE": {
      if (!can(user, "exchange:read")) return deny;
      const message = await db.query.exchangeMessages.findFirst({
        where: eq(exchangeMessages.id, attachment.entityId ?? ""),
        with: { exchange: true },
      });
      if (!message) return deny;
      if (message.isInternal && user.role === "FRANCHISE") return deny;
      if (!(await storeAllowed(user, message.exchange.storeId))) return deny;
      return { allowed: true, audit: false };
    }
    case "TICKET": {
      if (!can(user, "ticket:read")) return deny;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, attachment.entityId ?? ""),
      });
      if (!ticket) return deny;
      return { allowed: true, audit: false };
    }
    case "TICKET_COMMENT": {
      if (!can(user, "ticket:read")) return deny;
      const comment = await db.query.ticketComments.findFirst({
        where: eq(ticketComments.id, attachment.entityId ?? ""),
      });
      if (!comment) return deny;
      return { allowed: true, audit: false };
    }
    case "REMINDER": {
      if (!can(user, "finance:read")) return deny;
      const reminder = await db.query.reminders.findFirst({
        where: eq(reminders.id, attachment.entityId ?? ""),
      });
      if (!reminder) return deny;
      return { allowed: true, audit: false };
    }
    case "STORE": {
      if (!can(user, "store:read")) return deny;
      if (!(await storeAllowed(user, attachment.entityId ?? null))) return deny;
      return { allowed: true, audit: false };
    }
    case "FRANCHISEE": {
      if (user.role === "FRANCHISE") {
        return attachment.entityId === user.franchiseeId
          ? { allowed: true, audit: false }
          : deny;
      }
      if (!can(user, "franchisee:read")) return deny;
      return { allowed: true, audit: false };
    }
    default:
      // Fichier sans rattachement : seul l'uploadeur (ou un admin) y accède —
      // cas transitoire entre l'upload et le rattachement.
      return {
        allowed: attachment.uploadedById === user.id || user.role === "ADMIN",
        audit: false,
      };
  }
}
