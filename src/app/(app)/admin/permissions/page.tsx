import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  can,
  type Role,
} from "@/lib/authz/permissions";
import { PERMISSION_LABELS, ROLE_LABELS } from "@/lib/labels";
import { listPermissionOverrides } from "@/services/permissions.service";
import { listCustomRoles } from "@/services/custom-roles.service";
import { AccessDenied } from "@/components/access-denied";

import { CustomRolesManager } from "./custom-roles-manager";
import {
  PermissionsMatrix,
  type MatrixColumn,
  type MatrixRow,
} from "./permissions-matrix";

export const metadata: Metadata = { title: "Droits d'accès" };

// Rôles modifiables — ADMIN est volontairement exclu (toujours tous les droits).
const EDITABLE_ROLES: Role[] = [
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
  "SALARIE",
];

export default async function PermissionsPage() {
  const user = await requireUser();
  if (!can(user, "permission:manage")) return <AccessDenied />;

  const [overrides, customRoles] = await Promise.all([
    listPermissionOverrides(user),
    listCustomRoles(user),
  ]);
  const overrideMap = new Map(
    overrides.map((o) => [`${o.role}:${o.permission}`, o.allowed])
  );

  const columns: MatrixColumn[] = [
    ...EDITABLE_ROLES.map((role) => ({
      value: role as string,
      label: ROLE_LABELS[role] ?? role,
      kind: "base" as const,
      testKey: role as string,
    })),
    ...customRoles.map((role) => ({
      value: role.id,
      label: role.name,
      kind: "custom" as const,
      testKey: role.name,
    })),
  ];

  const customOverrideMaps = new Map(
    customRoles.map((role) => [
      role.id,
      new Map(role.permissions.map((p) => [p.permission, p.allowed])),
    ])
  );

  const rows: MatrixRow[] = ALL_PERMISSIONS.map((permission) => ({
    permission,
    label: PERMISSION_LABELS[permission] ?? permission,
    cells: Object.fromEntries([
      ...EDITABLE_ROLES.map((role) => [
        role,
        {
          defaultValue: PERMISSIONS[role].has(permission),
          override: overrideMap.get(`${role}:${permission}`) ?? null,
        },
      ]),
      ...customRoles.map((role) => [
        role.id,
        {
          defaultValue: PERMISSIONS[role.baseRole].has(permission),
          override: customOverrideMaps.get(role.id)?.get(permission) ?? null,
        },
      ]),
    ]),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Droits d&apos;accès</h1>
        <p className="text-sm text-muted-foreground">
          Accordez ou retirez une permission à un type de compte, à effet
          immédiat. Les cases surlignées sont des écarts par rapport à la
          matrice par défaut ; recocher la valeur d&apos;origine supprime
          l&apos;écart. Le rôle ADMIN conserve toujours tous les droits. Créez
          des rôles personnalisés (basés sur un rôle existant) puis
          assignez-les depuis Utilisateurs.
        </p>
      </div>
      <CustomRolesManager
        baseRoles={EDITABLE_ROLES.map((r) => ({
          value: r,
          label: ROLE_LABELS[r] ?? r,
        }))}
        customRoles={customRoles.map((r) => ({
          id: r.id,
          name: r.name,
          baseRoleLabel: ROLE_LABELS[r.baseRole] ?? r.baseRole,
        }))}
      />
      <PermissionsMatrix roles={columns} rows={rows} />
    </div>
  );
}
