import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { daysBetweenIso, formatDateFr, todayParis } from "@/lib/dates";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "@/lib/labels";
import { listContracts } from "@/services/contracts.service";
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

export const metadata: Metadata = { title: "Contrats" };

function ExpiryBadge({ endDate, today }: { endDate: string | null; today: string }) {
  if (!endDate) return <span className="text-muted-foreground">—</span>;
  const days = daysBetweenIso(today, endDate);
  if (days < 0) {
    return <Badge variant="destructive">Échu depuis {-days} j</Badge>;
  }
  if (days <= 183) {
    return <Badge variant="warning">Dans {days} j</Badge>;
  }
  return <span className="text-muted-foreground">{formatDateFr(endDate)}</span>;
}

export default async function ContratsPage() {
  const user = await requireUser();
  if (!can(user, "contract:read")) return <AccessDenied />;

  const rows = await listContracts(user);
  const today = todayParis();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contrats</h1>
        <p className="text-sm text-muted-foreground">
          Vue transverse triée par échéance — l&apos;alerte automatique part 6 mois
          avant la fin (paramétrable par contrat).
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Boutique</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Échéance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun contrat.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((contract) => (
                <TableRow key={contract.id} data-testid={`contract-row-${contract.reference ?? contract.id}`}>
                  <TableCell>
                    <Link
                      href={`/contrats/${contract.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {contract.store.code} — {contract.store.name}
                    </Link>
                  </TableCell>
                  <TableCell>{CONTRACT_TYPE_LABELS[contract.type]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {contract.reference ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contract.status === "ACTIF" ? "success" : "secondary"}>
                      {CONTRACT_STATUS_LABELS[contract.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateFr(contract.startDate)}
                  </TableCell>
                  <TableCell>
                    <ExpiryBadge endDate={contract.endDate} today={today} />
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
