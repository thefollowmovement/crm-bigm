import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { listClaimsForAccounting } from "@/services/expense-claims.service";
import { EXPENSE_CLAIM_STATUS_LABELS } from "@/lib/labels";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ReimburseButton } from "./reimburse-button";

export const metadata: Metadata = { title: "Notes de frais" };

const STATUSES = ["VALIDEE", "DEMANDE", "REMBOURSEE", "REFUSEE"] as const;

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "info"> = {
  DEMANDE: "secondary",
  VALIDEE: "info",
  REFUSEE: "destructive",
  REMBOURSEE: "success",
};

export default async function NotesDeFraisPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <AccessDenied />;
  const params = await searchParams;

  const status = STATUSES.includes(params.statut as (typeof STATUSES)[number])
    ? (params.statut as (typeof STATUSES)[number])
    : null;
  const claims = await listClaimsForAccounting(user, { status });
  const canWrite = can(user, "accounting:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notes de frais</h1>
        <p className="text-sm text-muted-foreground">
          Frais de visite (VHR, péages…) saisis par les animateurs et validés
          par la direction — à rembourser par la comptabilité.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={status === null ? "default" : "outline"} size="sm">
          <Link href="/compta/notes-de-frais">Toutes</Link>
        </Button>
        {STATUSES.map((value) => (
          <Button
            key={value}
            asChild
            variant={status === value ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/compta/notes-de-frais?statut=${value}`}>
              {EXPENSE_CLAIM_STATUS_LABELS[value]}
            </Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {claims.length} note{claims.length > 1 ? "s" : ""} de frais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="claims-table">
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Visite</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Justificatifs</TableHead>
                <TableHead>Statut</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune note de frais.
                  </TableCell>
                </TableRow>
              ) : (
                claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">
                      {claim.title}
                      {claim.note ? (
                        <span className="block text-xs text-muted-foreground">
                          {claim.note}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/animation/visites/${claim.visit.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {claim.visit.store.code} —{" "}
                        {formatDateFr(claim.visit.visitDate)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {claim.createdBy.firstName} {claim.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatEUR(claim.amountTTC)}
                    </TableCell>
                    <TableCell>
                      {claim.attachments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-2">
                          {claim.attachments.map((file) => (
                            <a
                              key={file.id}
                              href={`/api/files/${file.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs underline-offset-2 hover:underline"
                            >
                              {file.title ?? file.originalName}
                            </a>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[claim.status] ?? "secondary"}>
                        {EXPENSE_CLAIM_STATUS_LABELS[claim.status]}
                      </Badge>
                      {claim.decidedBy ? (
                        <span className="block text-xs text-muted-foreground">
                          par {claim.decidedBy.firstName} {claim.decidedBy.lastName}
                        </span>
                      ) : null}
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        {claim.status === "VALIDEE" ? (
                          <ReimburseButton claimId={claim.id} />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
