import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listDepots } from "@/services/purchases.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateDepotDialog, ToggleDepotButton } from "./depot-dialogs";

export const metadata: Metadata = { title: "Dépôts DPS" };

export default async function DepotsPage() {
  const user = await requireUser();
  if (!can(user, "purchase:write")) return <AccessDenied />;

  const depots = await listDepots(user, { includeInactive: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dépôts DPS</h1>
          <p className="text-sm text-muted-foreground">
            Dépôts d&apos;approvisionnement du réseau — chaque boutique est
            rattachée à un dépôt (fiche boutique).
          </p>
        </div>
        <CreateDepotDialog />
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="depots-table">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {depots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun dépôt. Créez-en un pour saisir des achats.
                </TableCell>
              </TableRow>
            ) : (
              depots.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-sm">{d.code}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.city ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={d.isActive ? "success" : "secondary"}>
                      {d.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleDepotButton id={d.id} isActive={d.isActive} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
