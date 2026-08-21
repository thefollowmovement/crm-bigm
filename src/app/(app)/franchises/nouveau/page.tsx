import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { AccessDenied } from "@/components/access-denied";

import { FranchiseeForm } from "../franchisee-form";

export const metadata: Metadata = { title: "Nouveau franchisé" };

export default async function NouveauFranchisePage() {
  const user = await requireUser();
  if (!can(user, "franchisee:write")) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nouveau franchisé</h1>
        <p className="text-sm text-muted-foreground">
          Société signataire d&apos;un ou plusieurs contrats de franchise.
        </p>
      </div>
      <FranchiseeForm canSeeNotes={can(user, "store:read_internal_notes")} />
    </div>
  );
}
