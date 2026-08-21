import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { AccessDenied } from "@/components/access-denied";

import { StoreForm } from "../store-form";
import { loadStoreFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Nouvelle boutique" };

export default async function NouvelleBoutiquePage() {
  const user = await requireUser();
  if (!can(user, "store:write")) return <AccessDenied />;

  const options = await loadStoreFormOptions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nouvelle boutique</h1>
        <p className="text-sm text-muted-foreground">
          Crée la fiche centrale d&apos;un restaurant du réseau.
        </p>
      </div>
      <StoreForm
        franchisees={options.franchisees}
        animateurs={options.animateurs}
        canSeeInternalNotes={can(user, "store:read_internal_notes")}
      />
    </div>
  );
}
