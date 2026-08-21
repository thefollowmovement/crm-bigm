import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatEUR } from "@/lib/money";
import { PREMISES_STATUS_LABELS } from "@/lib/labels";
import { listAgents } from "@/services/prospects.service";
import { listPremises } from "@/services/premises.service";
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

import { CreatePremisesDialog } from "./premises-components";

export const metadata: Metadata = { title: "Locaux" };

export default async function PremisesListPage() {
  const user = await requireUser();
  if (!can(user, "development:read")) return <AccessDenied />;

  const canWrite = can(user, "development:write");
  const [rows, agents] = await Promise.all([
    listPremises(user),
    canWrite ? listAgents(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Base de locaux</h1>
          <p className="text-sm text-muted-foreground">
            Locaux commerciaux repérés pour les implantations.
          </p>
        </div>
        {canWrite ? (
          <CreatePremisesDialog
            agents={agents.map((a) => ({ id: a.id, label: a.name }))}
          />
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="premises-table">
          <TableHeader>
            <TableRow>
              <TableHead>Adresse</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Surface</TableHead>
              <TableHead>Loyer</TableHead>
              <TableHead>Droit au bail</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun local.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/developpement/locaux/${p.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {p.address}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.city}</TableCell>
                  <TableCell>{p.surfaceM2 ? `${p.surfaceM2} m²` : "—"}</TableCell>
                  <TableCell>{p.monthlyRent ? formatEUR(p.monthlyRent) : "—"}</TableCell>
                  <TableCell>{p.leaseRights ? formatEUR(p.leaseRights) : "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === "DISPONIBLE"
                          ? "success"
                          : p.status === "ECARTE"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {PREMISES_STATUS_LABELS[p.status]}
                    </Badge>
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
