import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  computeResult,
  listInvoices,
  type AcctInvoice,
} from "@/services/acct-invoices.service";
import {
  listImports,
  listStructures,
} from "@/services/acct-structures.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACCT_CLASS_LABELS,
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_PIECE_TYPE_LABELS,
  ACCT_SOURCE_LABELS,
} from "@/lib/labels";
import { formatEUR } from "@/lib/money";

import Link from "next/link";

import {
  CreateInvoiceDialog,
  EditInvoiceDialog,
  ImportInvoicesDialog,
  InvoiceAttachmentsDialog,
  InvoiceReminderDialog,
} from "./invoice-dialogs";

export const metadata: Metadata = { title: "Journal factures" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  PAYEE: "success",
  EN_ATTENTE: "secondary",
  EN_RETARD: "destructive",
  IMPAYEE: "destructive",
  ANNULEE: "outline",
};

export default async function FacturesComptaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    structure?: string;
    classe?: string;
    statut?: string;
    du?: string;
    au?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <AccessDenied />;
  const params = await searchParams;

  const today = todayParis();
  const year = today.slice(0, 4);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.du ?? "")
    ? params.du!
    : `${year}-01-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.au ?? "")
    ? params.au!
    : `${year}-12-31`;
  const accountClass =
    params.classe === "CHARGE" || params.classe === "PRODUIT"
      ? (params.classe as AcctInvoice["accountClass"])
      : null;
  const status =
    params.statut && params.statut in ACCT_INVOICE_STATUS_LABELS
      ? (params.statut as AcctInvoice["status"])
      : null;
  const structureId =
    params.structure && /^[0-9a-f-]{36}$/.test(params.structure)
      ? params.structure
      : null;

  const canWrite = can(user, "accounting:write");
  const [invoices, structures, result, imports] = await Promise.all([
    listInvoices(user, {
      q: params.q ?? null,
      structureId,
      accountClass,
      status,
      from,
      to,
    }),
    listStructures(user, { active: "actives" }),
    computeResult(user, { from, to, structureId }),
    listImports(user, "FACTURES"),
  ]);
  const structureOptions = structures.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Journal factures &amp; avoirs</h1>
          <p className="text-sm text-muted-foreground">
            Pièces comptables du groupe, classées 6 (charges) / 7 (produits).
            Le statut est renseigné à la main par la comptabilité.
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            {can(user, "accounting:import") ? <ImportInvoicesDialog /> : null}
            <CreateInvoiceDialog structures={structureOptions} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card data-testid="result-revenue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CA total (classe 7, HT)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatEUR(result.revenueHT)}
          </CardContent>
        </Card>
        <Card data-testid="result-expenses">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Charges totales (classe 6, HT)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatEUR(result.expensesHT)}
          </CardContent>
        </Card>
        <Card data-testid="result-total">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Résultat (CA − charges)
              <InfoHint text="Somme des montants HT des pièces non annulées sur la période filtrée (avoirs négatifs inclus). La TVA n'entre pas dans le résultat." />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatEUR(result.result)}
          </CardContent>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="w-52">
          <Input
            name="q"
            placeholder="N° de pièce, libellé…"
            defaultValue={params.q ?? ""}
          />
        </div>
        <select
          name="structure"
          defaultValue={structureId ?? ""}
          className="h-9 max-w-56 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Toutes les structures</option>
          {structureOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        <select
          name="classe"
          defaultValue={accountClass ?? ""}
          className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Classes 6 et 7</option>
          <option value="PRODUIT">7 — Produits</option>
          <option value="CHARGE">6 — Charges</option>
        </select>
        <select
          name="statut"
          defaultValue={status ?? ""}
          className="h-9 rounded-full border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(ACCT_INVOICE_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div>
          <Input name="du" type="date" defaultValue={from} className="w-38" />
        </div>
        <div>
          <Input name="au" type="date" defaultValue={to} className="w-38" />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {invoices.length} pièce{invoices.length > 1 ? "s" : ""} sur la
            période
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="invoices-table">
            <TableHeader>
              <TableRow>
                <TableHead>N° pièce</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Structure</TableHead>
                <TableHead className="text-right">HT</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>PJ</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 12 : 11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Aucune pièce sur la période — importez un journal ou créez
                    une pièce.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const overdue =
                    invoice.dueDate !== null &&
                    invoice.dueDate < today &&
                    (invoice.status === "EN_ATTENTE" ||
                      invoice.status === "EN_RETARD" ||
                      invoice.status === "IMPAYEE");
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">
                        {invoice.pieceNumber}
                        {invoice.invoiceType === "RFA" ? (
                          <Badge variant="outline" className="ml-1">
                            RFA
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]}
                      </TableCell>
                      <TableCell>
                        {ACCT_CLASS_LABELS[invoice.accountClass]}
                      </TableCell>
                      <TableCell>{formatDateFr(invoice.pieceDate)}</TableCell>
                      <TableCell className={overdue ? "text-destructive" : ""}>
                        {invoice.dueDate ? formatDateFr(invoice.dueDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/compta/structures/${invoice.structure.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          <span className="font-mono text-xs">
                            {invoice.structure.code}
                          </span>{" "}
                          {invoice.structure.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(invoice.amountHT)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(invoice.amountTTC)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ACCT_SOURCE_LABELS[invoice.source]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGES[invoice.status] ?? "secondary"}>
                          {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <InvoiceAttachmentsDialog
                          invoice={{
                            id: invoice.id,
                            pieceNumber: invoice.pieceNumber,
                          }}
                          attachments={invoice.attachments}
                          canWrite={canWrite}
                        />
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {invoice.status === "EN_ATTENTE" ||
                            invoice.status === "EN_RETARD" ||
                            invoice.status === "IMPAYEE" ? (
                              <InvoiceReminderDialog
                                invoice={{
                                  id: invoice.id,
                                  pieceNumber: invoice.pieceNumber,
                                  structureEmail: invoice.structure.email,
                                  lastReminderLevel: invoice.lastReminderLevel,
                                }}
                              />
                            ) : null}
                            <EditInvoiceDialog
                              invoice={{
                                id: invoice.id,
                                pieceNumber: invoice.pieceNumber,
                                status: invoice.status,
                                invoiceType: invoice.invoiceType,
                                accountClass: invoice.accountClass,
                                dueDate: invoice.dueDate,
                                notes: invoice.notes,
                              }}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Derniers imports du journal</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead className="text-right">Créées / MAJ / Ignorées</TableHead>
                  <TableHead className="text-right">Erreurs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell>
                      {imp.createdAt.toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {imp.fileName}{" "}
                      <Badge variant="outline">{imp.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      {imp.createdBy.firstName} {imp.createdBy.lastName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {imp.createdRows} / {imp.updatedRows} / {imp.skippedRows}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(imp.errors as unknown[]).length}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
