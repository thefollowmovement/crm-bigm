// Matrice unique des permissions par rôle — source de vérité de tout le
// contrôle d'accès. Testée exhaustivement dans tests/unit/permissions.test.ts.
//
// Le rôle FRANCHISE est en plus SCOPÉ : il ne voit que les données de ses
// boutiques (voir scopeToStores dans guards.ts) et jamais les champs internes
// (voir field-visibility.ts).
import type { SessionUser } from "@/lib/auth/session";

export type Permission =
  | "store:read"
  | "store:write"
  | "store:read_internal_notes"
  | "franchisee:read"
  | "franchisee:write"
  | "contract:read"
  | "contract:write"
  | "document:read"
  | "document:write"
  | "exchange:read"
  | "exchange:write"
  | "finance:read"
  | "finance:write"
  | "revenue:read"
  | "revenue:write"
  | "revenue:import"
  | "product:manage"
  | "ticket:read"
  | "ticket:write"
  | "visit:read"
  | "visit:write"
  | "actionplan:read"
  | "actionplan:write"
  | "planning:read"
  | "planning:write"
  | "purchase:read"
  | "purchase:write"
  | "purchase:import"
  | "foodcost:read"
  | "foodcost:write"
  | "training:read"
  | "training:write"
  | "commtask:read"
  | "commtask:write"
  | "commtask:request"
  | "partner:read"
  | "partner:write"
  | "hr:read"
  | "hr:write"
  | "self:clock"
  | "self:leave"
  | "opening:read"
  | "opening:write"
  | "opening:checklist"
  | "development:read"
  | "development:write"
  | "resale:read"
  | "resale:write"
  | "user:manage"
  | "audit:read";

export type Role = SessionUser["role"];

const ALL: readonly Permission[] = [
  "store:read",
  "store:write",
  "store:read_internal_notes",
  "franchisee:read",
  "franchisee:write",
  "contract:read",
  "contract:write",
  "document:read",
  "document:write",
  "exchange:read",
  "exchange:write",
  "finance:read",
  "finance:write",
  "revenue:read",
  "revenue:write",
  "revenue:import",
  "product:manage",
  "ticket:read",
  "ticket:write",
  "visit:read",
  "visit:write",
  "actionplan:read",
  "actionplan:write",
  "planning:read",
  "planning:write",
  "purchase:read",
  "purchase:write",
  "purchase:import",
  "foodcost:read",
  "foodcost:write",
  "training:read",
  "training:write",
  "commtask:read",
  "commtask:write",
  "commtask:request",
  "partner:read",
  "partner:write",
  "hr:read",
  "hr:write",
  "self:clock",
  "self:leave",
  "opening:read",
  "opening:write",
  "opening:checklist",
  "development:read",
  "development:write",
  "resale:read",
  "resale:write",
  "user:manage",
  "audit:read",
];

export const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ALL),
  DIRECTION: new Set(ALL),
  COMPTABILITE: new Set([
    "store:read",
    "store:read_internal_notes",
    "franchisee:read",
    "contract:read",
    "document:read",
    "exchange:read",
    "exchange:write",
    "finance:read",
    "finance:write",
    "revenue:read",
    "revenue:write",
    "revenue:import",
    "product:manage",
    "ticket:read",
    "ticket:write",
    "visit:read",
    "actionplan:read",
    "planning:read",
    "purchase:read",
    "purchase:write",
    "purchase:import",
    "foodcost:read",
    "training:read",
    "commtask:read",
    "commtask:request",
    "partner:read",
    "opening:read",
    "opening:checklist",
  ]),
  RH: new Set([
    "store:read",
    "store:read_internal_notes",
    "document:read",
    "document:write",
    "ticket:read",
    "ticket:write",
    "visit:read",
    "actionplan:read",
    "planning:read",
    "training:read",
    "training:write",
    "commtask:read",
    "commtask:request",
    "partner:read",
    "hr:read",
    "hr:write",
    "self:clock",
    "self:leave",
    "opening:read",
    "opening:checklist",
  ]),
  ANIMATION: new Set([
    "store:read",
    "store:read_internal_notes",
    "franchisee:read",
    "contract:read",
    "document:read",
    "exchange:read",
    "exchange:write",
    "revenue:read",
    "ticket:read",
    "ticket:write",
    "visit:read",
    "visit:write",
    "actionplan:read",
    "actionplan:write",
    "planning:read",
    "planning:write",
    "purchase:read",
    "foodcost:read",
    "training:read",
    "training:write",
    "commtask:read",
    "commtask:request",
    "partner:read",
    "opening:read",
    "opening:checklist",
  ]),
  COMMUNICATION: new Set([
    "store:read",
    "document:read",
    "document:write",
    "exchange:read",
    "ticket:read",
    "ticket:write",
    "visit:read",
    "actionplan:read",
    "planning:read",
    "training:read",
    "commtask:read",
    "commtask:write",
    "commtask:request",
    "partner:read",
    "partner:write",
    "opening:read",
    "opening:checklist",
  ]),
  DEVELOPPEMENT: new Set([
    "store:read",
    "store:read_internal_notes",
    "store:write",
    "franchisee:read",
    "franchisee:write",
    "contract:read",
    "contract:write",
    "document:read",
    "exchange:read",
    "ticket:read",
    "ticket:write",
    "visit:read",
    "actionplan:read",
    "planning:read",
    "training:read",
    "commtask:read",
    "commtask:request",
    "partner:read",
    "opening:read",
    "opening:write",
    "opening:checklist",
    // Prospection et cessions : réservées au pôle (et à la direction).
    "development:read",
    "development:write",
    "resale:read",
    "resale:write",
  ]),
  FRANCHISE: new Set([
    "store:read",
    "contract:read",
    "document:read",
    "exchange:read",
    "exchange:write",
    "revenue:read",
    "revenue:write",
    "actionplan:read",
    "purchase:read",
    "training:read",
    "commtask:read",
    "commtask:request",
    "opening:read",
  ]),
  // Salarié d'une boutique : pointeuse et congés en self-service, rien d'autre
  // (cdc §12) — pas d'accès aux modules réseau.
  SALARIE: new Set(["self:clock", "self:leave"]),
};

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  return PERMISSIONS[user.role].has(permission);
}
