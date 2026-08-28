import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import {
  getProviderStructure,
  listProviderInvoices,
  listProviderTickets,
  listProviderTransmissions,
} from "@/services/providers.service";
import {
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_PIECE_TYPE_LABELS,
  TICKET_STATUS_LABELS,
  TRANSMISSION_CASE_LABELS,
  TRANSMISSION_STATUS_LABELS,
} from "@/lib/labels";
import { formatTransmissionNumber } from "@/services/transmissions.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ProviderDepositDialog, ProviderTicketDialog } from "./provider-components";

export const metadata: Metadata = { title: "Espace prestataire" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  PAYEE: "success",
  EN_ATTENTE: "secondary",
  EN_RETARD: "destructive",
  IMPAYEE: "destructive",
  ANNULEE: "outline",
};

const TRANSMISSION_BADGES: Record<string, "success" | "secondary" | "destructive" | "info"> = {
  EN_ATTENTE: "secondary",
  VALIDEE: "success",
  REJETEE: "destructive",
  TRAITEE: "info",
};

export default async function ProviderPortalPage() {
  const user = await requireUser();
  if (!can(user, "provider:portal")) return <AccessDenied />;
  if (!user.acctStructureId) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Votre compte n&apos;est rattaché à aucune structure comptable — contactez
        la comptabilité Big M.
      </p>
    );
  }

  const today = todayParis();
  const [structure, invoices, deposits, tickets] = await Promise.all([
    getProviderStructure(user),
    listProviderInvoices(user),
    listProviderTransmissions(user),
    listProviderTickets(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="provider-title">
            Espace prestataire — {structure.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Compte client <span className="font-mono">{structure.code}</span>
            {structure.company ? ` · ${structure.company}` : ""} — vos factures,
            leurs statuts de paiement et vos échanges avec la comptabilité.
          </p>
        </div>
        <div className="flex gap-2">
          <ProviderTicketDialog />
          <ProviderDepositDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes factures au journal comptable</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="provider-invoices">
            <TableHeader>
              <TableRow>
                <TableHead>N° pièce</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Statut de paiement</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune facture enregistrée pour votre compte — déposez-en
                    une, la comptabilité l&apos;intégrera après validation.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const overdue =
                    invoice.dueDate !== null &&
                    invoice.dueDate < today &&
                    invoice.status !== "PAYEE" &&
                    invoice.status !== "ANNULEE";
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/prestataire/factures/${invoice.id}`}
                          className="underline-offset-2 hover:underline"
                          data-testid={`provider-invoice-${invoice.pieceNumber}`}
                        >
                          {invoice.pieceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]}
                      </TableCell>
                      <TableCell>{formatDateFr(invoice.pieceDate)}</TableCell>
                      <TableCell className={overdue ? "text-destructive" : ""}>
                        {invoice.dueDate ? formatDateFr(invoice.dueDate) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(invoice.amountTTC)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGES[invoice.status] ?? "secondary"}>
                          {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/prestataire/factures/${invoice.id}`}
                          className="text-sm underline-offset-2 hover:underline"
                        >
                          Détail &amp; discussion →
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mes dépôts en attente de traitement</CardTitle>
          </CardHeader>
          <CardContent>
            {deposits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun dépôt.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="provider-deposits">
                {deposits.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
                  >
                    <span className="font-mono text-xs">
                      {formatTransmissionNumber(d.number)}
                    </span>
                    <span className="font-medium">{d.subject}</span>
                    <Badge variant="outline">
                      {TRANSMISSION_CASE_LABELS[d.caseType] ?? d.caseType}
                    </Badge>
                    <span className="ml-auto flex items-center gap-2">
                      {d.amount ? formatEUR(d.amount) : null}
                      <Badge variant={TRANSMISSION_BADGES[d.status] ?? "secondary"}>
                        {TRANSMISSION_STATUS_LABELS[d.status]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun ticket — ouvrez-en un pour toute question à la
                comptabilité.
              </p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="provider-tickets">
                {tickets.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
                  >
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      T-{String(t.number).padStart(6, "0")} — {t.title}
                    </Link>
                    <Badge className="ml-auto" variant="secondary">
                      {TICKET_STATUS_LABELS[t.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
