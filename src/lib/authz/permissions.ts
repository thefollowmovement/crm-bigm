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
  ]),
};

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  return PERMISSIONS[user.role].has(permission);
}
