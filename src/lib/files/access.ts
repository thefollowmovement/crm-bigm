import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  actionPlans,
  commTasks,
  contracts,
  documentVersions,
  employees,
  exchangeMessages,
  openingSteps,
  fileAttachments,
  reminders,
  storeVisits,
  ticketComments,
  tickets,
  trainings,
  transmissions,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { accessibleStoreIds, isFranchisorMember } from "@/lib/authz/guards";

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
    case "STORE_VISIT": {
      // Comptes rendus de visite : internes au siège (jamais FRANCHISE).
      if (!can(user, "visit:read")) return deny;
      const visit = await db.query.storeVisits.findFirst({
        where: eq(storeVisits.id, attachment.entityId ?? ""),
      });
      if (!visit) return deny;
      return { allowed: true, audit: false };
    }
    case "ACTION_PLAN": {
      if (!can(user, "actionplan:read")) return deny;
      const plan = await db.query.actionPlans.findFirst({
        where: eq(actionPlans.id, attachment.entityId ?? ""),
      });
      if (!plan || !(await storeAllowed(user, plan.storeId))) return deny;
      return { allowed: true, audit: false };
    }
    case "TRAINING": {
      // Documents de formation : lisibles selon le périmètre boutique
      // (les documents signés d'un franchisé lui sont accessibles).
      if (!can(user, "training:read")) return deny;
      const training = await db.query.trainings.findFirst({
        where: eq(trainings.id, attachment.entityId ?? ""),
      });
      if (!training || !(await storeAllowed(user, training.storeId))) return deny;
      return { allowed: true, audit: true };
    }
    case "COMM_TASK": {
      if (!can(user, "commtask:read")) return deny;
      const task = await db.query.commTasks.findFirst({
        where: eq(commTasks.id, attachment.entityId ?? ""),
      });
      if (!task) return deny;
      if (user.role === "FRANCHISE") {
        const allowed =
          task.requesterId === user.id ||
          (task.storeId !== null && (await storeAllowed(user, task.storeId)));
        if (!allowed) return deny;
      }
      return { allowed: true, audit: false };
    }
    case "PARTNER": {
      if (!can(user, "partner:read")) return deny;
      return { allowed: true, audit: false };
    }
    case "OPENING_STEP": {
      // PJ des jalons d'ouverture (plans, devis…) : périmètre boutique.
      if (!can(user, "opening:read")) return deny;
      const step = await db.query.openingSteps.findFirst({
        where: eq(openingSteps.id, attachment.entityId ?? ""),
        with: { project: { columns: { storeId: true } } },
      });
      if (!step || !(await storeAllowed(user, step.project.storeId))) return deny;
      return { allowed: true, audit: false };
    }
    case "TRANSMISSION": {
      // PJ des transmissions comptables : la compta/direction qui traite,
      // ou l'émetteur interne de la transmission.
      const transmission = await db.query.transmissions.findFirst({
        where: eq(transmissions.id, attachment.entityId ?? ""),
      });
      if (!transmission) return deny;
      if (can(user, "transmission:manage")) return { allowed: true, audit: false };
      return transmission.emitterUserId === user.id
        ? { allowed: true, audit: false }
        : deny;
    }
    case "ACCT_IMPORT": {
      // Fichier original d'un import comptable : lecture compta/direction.
      if (!can(user, "accounting:read")) return deny;
      return { allowed: true, audit: false };
    }
    case "PROSPECT":
    case "PREMISES": {
      // Dossiers de prospection : réservés au développement/direction.
      if (!can(user, "development:read")) return deny;
      return { allowed: true, audit: false };
    }
    case "STORE_PHOTO": {
      // Photo de la fiche boutique : visible de qui voit la boutique
      // (franchisé scopé à ses boutiques) ; pas d'audit (affichée en liste).
      if (!can(user, "store:read")) return deny;
      if (!(await storeAllowed(user, attachment.entityId))) return deny;
      return { allowed: true, audit: false };
    }
    case "EMPLOYEE": {
      // Dossier RH : RH/direction, ou le salarié lui-même (compte lié).
      // Fiche du siège Big M CIE : membres de l'entité FRANCHISEUR seulement.
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, attachment.entityId ?? ""),
      });
      if (!employee) return deny;
      if (
        employee.storeId === null &&
        employee.userId !== user.id &&
        !isFranchisorMember(user)
      ) {
        return deny;
      }
      if (can(user, "hr:read") || employee.userId === user.id) {
        return { allowed: true, audit: true };
      }
      return deny;
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
