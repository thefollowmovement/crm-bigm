"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";

import { setPermissionOverrideAction } from "./actions";

export type MatrixRow = {
  permission: string;
  label: string;
  // par rôle : valeur par défaut de la matrice + écart éventuel
  cells: Record<string, { defaultValue: boolean; override: boolean | null }>;
};

export function PermissionsMatrix({
  roles,
  rows,
}: {
  roles: { value: string; label: string }[];
  rows: MatrixRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(role: string, permission: string, allowed: boolean) {
    startTransition(async () => {
      const result = await setPermissionOverrideAction({ role, permission, allowed });
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.success ?? "Droits mis à jour.");
        router.refresh();
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm" data-testid="permissions-matrix">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="sticky left-0 bg-card px-3 py-2 font-medium">
              Permission
            </th>
            {roles.map((role) => (
              <th key={role.value} className="px-3 py-2 text-center font-medium">
                {role.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.permission} className="border-b last:border-0">
              <td className="sticky left-0 whitespace-nowrap bg-card px-3 py-1.5">
                {row.label}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {row.permission}
                </span>
              </td>
              {roles.map((role) => {
                const cell = row.cells[role.value];
                const effective = cell.override ?? cell.defaultValue;
                const isOverride = cell.override !== null;
                return (
                  <td key={role.value} className="px-3 py-1.5 text-center">
                    <span
                      className={
                        isOverride
                          ? "inline-flex rounded-md bg-amber-100 p-1 dark:bg-amber-900/40"
                          : "inline-flex p-1"
                      }
                      title={
                        isOverride
                          ? "Écart par rapport à la matrice par défaut"
                          : undefined
                      }
                    >
                      <Checkbox
                        checked={effective}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          toggle(role.value, row.permission, checked === true)
                        }
                        aria-label={`${row.label} pour ${role.label}`}
                        data-testid={`perm-${role.value}-${row.permission}`}
                      />
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
