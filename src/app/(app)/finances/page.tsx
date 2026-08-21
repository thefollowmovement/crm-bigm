import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from "@/lib/labels";
import { isOverdue, listInvoices } from "@/services/invoices.service";
import { listStores } from "@/services/stores.service";
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

import { CreateInvoiceDialog, InvoiceFilters } from "./invoice-dialogs";
import { invoiceStatusVariant } from "./status-variant";

export const metadata: Metadata = { title: "Factures & impayés" };

const STATUS_VALUES = ["EMISE", "PARTIELLEMENT_PAYEE", "PAYEE", "ANNULEE"] as const;

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "finance:read")) return <AccessDenied />;

  const params = await searchParams;
  const status = STATUS_VALUES.find((s) => s === params.statut);
  const overdueOnly = params.retard === "1";
  const storeId = typeof params.boutique === "string" ? params.boutique : undefined;

  const [rows, stores] = await Promise.all([
    listInvoices(user, { status, overdueOnly, storeId }),
    listStores(user),
  ]);
  const today = todayParis();
  const canWrite = can(user, "finance:write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Factures & impayés</h1>
          <p className="text-sm text-muted-foreground">
            Droits d&apos;entrée, redevances et relances — le retard est calculé sur
            l&apos;échéance, jamais figé en base.
          </p>
        </div>
        {canWrite ? (
          <CreateInvoiceDialog
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
          />
        ) : null}
      </div>

      <InvoiceFilters
        current={{ statut: status, retard: overdueOnly, boutique: storeId }}
        stores={stores.map((s) => ({ id: s.id, label: s.code }))}
      />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">TTC</TableHead>
              <TableHead className="text-right">Payé</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucune facture.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((invoice) => {
                const late = isOverdue(invoice, today);
                return (
                  <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.number}`}>
                    <TableCell>
                      <Link
                        href={`/finances/${invoice.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.store.code}
                    </TableCell>
                    <TableCell>
                      {INVOICE_TYPE_LABELS[invoice.type]}
                      {invoice.label ? (
                        <div className="text-xs text-muted-foreground">
                          {invoice.label}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(invoice.amountTTC)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatEUR(invoice.paidTotal)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateFr(invoice.dueDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Badge variant={invoiceStatusVariant(invoice.status)}>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                        {late ? <Badge variant="destructive">En retard</Badge> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
