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
  ]),
  RH: new Set([
    "store:read",
    "store:read_internal_notes",
    "document:read",
    "document:write",
    "ticket:read",
    "ticket:write",
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
  ]),
  COMMUNICATION: new Set([
    "store:read",
    "document:read",
    "document:write",
    "exchange:read",
    "ticket:read",
    "ticket:write",
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
  ]),
  FRANCHISE: new Set([
    "store:read",
    "contract:read",
    "document:read",
    "exchange:read",
    "exchange:write",
    "revenue:read",
    "revenue:write",
  ]),
};

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  return PERMISSIONS[user.role].has(permission);
}
