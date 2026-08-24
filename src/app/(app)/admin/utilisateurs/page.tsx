import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { db } from "@/lib/db/client";
import { franchisees } from "@/db/schema";
import { listUsers } from "@/services/users.service";
import { listCustomRoles } from "@/services/custom-roles.service";
import { AccessDenied } from "@/components/access-denied";

import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Utilisateurs" };

export default async function UtilisateursPage() {
  const user = await requireUser();
  if (!can(user, "user:manage")) return <AccessDenied />;

  const [allUsers, allFranchisees, customRoles] = await Promise.all([
    listUsers(user),
    db.query.franchisees.findMany({
      orderBy: [asc(franchisees.companyName)],
      columns: { id: true, companyName: true },
    }),
    listCustomRoles(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          Comptes d&apos;accès au CRM et rôles associés.
        </p>
      </div>
      <UsersTable
        users={allUsers.map((u) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          pole: u.pole,
          franchiseeId: u.franchiseeId,
          franchiseeName: u.franchisee?.companyName ?? null,
          franchisorMember: u.franchisorMember,
          customRoleId: u.customRole?.id ?? null,
          customRoleName: u.customRole?.name ?? null,
          isActive: u.isActive,
        }))}
        franchisees={allFranchisees}
        customRoles={customRoles.map((r) => ({
          id: r.id,
          name: r.name,
          baseRole: r.baseRole,
        }))}
        currentUserId={user.id}
        canImpersonate={can(user, "user:impersonate")}
      />
    </div>
  );
}
