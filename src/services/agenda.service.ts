import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  acctInvoices,
  actionPlans,
  commTasks,
  contracts,
  leaveRequests,
  openingSteps,
  storeVisits,
  stores,
  trainings,
} from "@/db/schema";
import { isFranchisorMember } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import {
  CONTRACT_TYPE_LABELS,
  OPENING_STEP_TYPE_LABELS,
  TRAINING_TYPE_LABELS,
  VISIT_TYPE_LABELS,
} from "@/lib/labels";

// Agenda transverse du tableau de bord : tout ce qui a une date à venir,
// filtré par les permissions de l'utilisateur et son périmètre (un franchisé
// ne voit que ses boutiques). Lecture seule — aucun état stocké.

export type AgendaEventType =
  | "VISITE"
  | "FORMATION"
  | "CONTRAT"
  | "FACTURE"
  | "PLAN_ACTION"
  | "JALON"
  | "COMM"
  | "CONGE";

export type AgendaEvent = {
  date: string; // YYYY-MM-DD
  type: AgendaEventType;
  label: string;
  link: string;
};

export const AGENDA_TYPE_LABELS: Record<AgendaEventType, string> = {
  VISITE: "Visite / audit",
  FORMATION: "Formation",
  CONTRAT: "Échéance contrat",
  FACTURE: "Échéance pièce comptable",
  PLAN_ACTION: "Plan d'action",
  JALON: "Jalon d'ouverture",
  COMM: "Tâche communication",
  CONGE: "Congés",
};

// Un utilisateur a un agenda si au moins une source lui est lisible
// (le rôle SALARIE n'en a aucune : pas de bloc sur son accueil).
export function hasAgendaAccess(user: SessionUser): boolean {
  return (
    can(user, "visit:read") ||
    can(user, "training:read") ||
    can(user, "contract:read") ||
    can(user, "accounting:read") ||
    can(user, "actionplan:read") ||
    can(user, "opening:read") ||
    can(user, "commtask:read") ||
    can(user, "hr:read")
  );
}

// Périmètre boutiques : null = tout le réseau ; [] = rien.
async function allowedStoreIds(actor: SessionUser): Promise<string[] | null> {
  if (actor.role !== "FRANCHISE") return null;
  if (!actor.franchiseeId) return [];
  const rows = await db.query.stores.findMany({
    where: eq(stores.franchiseeId, actor.franchiseeId),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function getAgenda(
  actor: SessionUser,
  range: { from: string; to: string }
): Promise<AgendaEvent[]> {
  if (!hasAgendaAccess(actor)) return [];
  const scope = await allowedStoreIds(actor);
  if (scope !== null && scope.length === 0) return [];

  const sources: Promise<AgendaEvent[]>[] = [];

  if (can(actor, "visit:read")) {
    sources.push(
      db.query.storeVisits
        .findMany({
          where: and(
            gte(storeVisits.visitDate, range.from),
            lte(storeVisits.visitDate, range.to),
            ...(scope ? [inArray(storeVisits.storeId, scope)] : [])
          ),
          with: { store: { columns: { code: true } } },
        })
        .then((rows) =>
          rows.map((v) => ({
            date: v.visitDate,
            type: "VISITE" as const,
            label: `${VISIT_TYPE_LABELS[v.type]} — ${v.store.code}`,
            link: `/animation/visites/${v.id}`,
          }))
        )
    );
  }

  if (can(actor, "training:read")) {
    sources.push(
      db.query.trainings
        .findMany({
          where: and(
            gte(trainings.trainingDate, range.from),
            lte(trainings.trainingDate, range.to),
            inArray(trainings.status, ["PLANIFIEE", "REALISEE", "VALIDEE"]),
            ...(scope ? [inArray(trainings.storeId, scope)] : [])
          ),
          with: { store: { columns: { code: true } } },
        })
        .then((rows) =>
          rows.map((t) => ({
            date: t.trainingDate,
            type: "FORMATION" as const,
            label: `Formation ${TRAINING_TYPE_LABELS[t.type]} — ${t.store.code}`,
            link: "/animation/formations",
          }))
        )
    );
  }

  if (can(actor, "contract:read")) {
    sources.push(
      db.query.contracts
        .findMany({
          where: and(
            eq(contracts.status, "ACTIF"),
            gte(contracts.endDate, range.from),
            lte(contracts.endDate, range.to),
            ...(scope ? [inArray(contracts.storeId, scope)] : [])
          ),
          with: { store: { columns: { code: true } } },
        })
        .then((rows) =>
          rows.map((c) => ({
            date: c.endDate!,
            type: "CONTRAT" as const,
            label: `Fin ${CONTRACT_TYPE_LABELS[c.type]} — ${c.store.code}`,
            link: `/contrats/${c.id}`,
          }))
        )
    );
  }

  // Échéances des pièces non soldées du journal comptable (étape 52) —
  // module compta, donc jamais visible du périmètre franchisé.
  if (scope === null && can(actor, "accounting:read")) {
    sources.push(
      db.query.acctInvoices
        .findMany({
          where: and(
            inArray(acctInvoices.status, ["EN_ATTENTE", "EN_RETARD", "IMPAYEE"]),
            gte(acctInvoices.dueDate, range.from),
            lte(acctInvoices.dueDate, range.to)
          ),
          with: { structure: { columns: { code: true } } },
        })
        .then((rows) =>
          rows.map((i) => ({
            date: i.dueDate!,
            type: "FACTURE" as const,
            label: `Pièce ${i.pieceNumber} — ${i.structure.code}`,
            link: `/compta/factures?structure=${i.structureId}`,
          }))
        )
    );
  }

  if (can(actor, "actionplan:read")) {
    sources.push(
      db.query.actionPlans
        .findMany({
          where: and(
            inArray(actionPlans.status, ["A_FAIRE", "EN_COURS"]),
            gte(actionPlans.dueDate, range.from),
            lte(actionPlans.dueDate, range.to),
            ...(scope ? [inArray(actionPlans.storeId, scope)] : [])
          ),
          with: { store: { columns: { code: true } } },
        })
        .then((rows) =>
          rows.map((p) => ({
            date: p.dueDate!,
            type: "PLAN_ACTION" as const,
            label: `PA-${String(p.number).padStart(6, "0")} ${p.title}`,
            link: "/animation/plans-action",
          }))
        )
    );
  }

  if (can(actor, "opening:read")) {
    sources.push(
      db.query.openingSteps
        .findMany({
          where: and(
            inArray(openingSteps.status, ["A_VENIR", "EN_COURS", "BLOQUEE"]),
            gte(openingSteps.plannedDate, range.from),
            lte(openingSteps.plannedDate, range.to)
          ),
          with: {
            project: { with: { store: { columns: { id: true, code: true } } } },
          },
        })
        .then((rows) =>
          rows
            .filter((s) => scope === null || scope.includes(s.project.store.id))
            .map((s) => ({
              date: s.plannedDate!,
              type: "JALON" as const,
              label: `${OPENING_STEP_TYPE_LABELS[s.step]} — ${s.project.store.code}`,
              link: `/developpement/ouvertures/${s.projectId}`,
            }))
        )
    );
  }

  if (can(actor, "commtask:read")) {
    sources.push(
      db.query.commTasks
        .findMany({
          where: and(
            inArray(commTasks.status, [
              "NOUVEAU",
              "AFFECTE",
              "EN_COURS",
              "EN_ATTENTE",
            ]),
            ...(scope ? [inArray(commTasks.storeId, scope)] : [])
          ),
        })
        .then((rows) =>
          rows
            .map((t) => ({ t, date: t.dueDate ?? t.publicationDate }))
            .filter(
              (x): x is { t: (typeof rows)[number]; date: string } =>
                x.date !== null && x.date >= range.from && x.date <= range.to
            )
            .map(({ t, date }) => ({
              date,
              type: "COMM" as const,
              label: `COM-${String(t.number).padStart(6, "0")} ${t.title}`,
              link: `/communication/${t.id}`,
            }))
        )
    );
  }

  if (can(actor, "hr:read")) {
    sources.push(
      db.query.leaveRequests
        .findMany({
          where: and(
            eq(leaveRequests.status, "VALIDEE"),
            lte(leaveRequests.startDate, range.to),
            gte(leaveRequests.endDate, range.from)
          ),
          with: {
            employee: {
              columns: { firstName: true, lastName: true, storeId: true },
            },
          },
        })
        .then((rows) =>
          rows
            // Congés du siège Big M CIE : membres de l'entité seulement.
            .filter((l) => isFranchisorMember(actor) || l.employee.storeId !== null)
            .map((l) => ({
              date: l.startDate < range.from ? range.from : l.startDate,
              type: "CONGE" as const,
              label: `Congés ${l.employee.firstName} ${l.employee.lastName}`,
              link: "/rh/conges?vue=calendrier",
            }))
        )
    );
  }

  const events = (await Promise.all(sources)).flat();
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)
  );
}
