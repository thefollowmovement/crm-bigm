import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR, fromCents, toCents } from "@/lib/money";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  REMINDER_CHANNEL_LABELS,
} from "@/lib/labels";
import { getInvoice, isOverdue } from "@/services/invoices.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { invoiceStatusVariant } from "../status-variant";
import {
  AddPaymentDialog,
  AddReminderDialog,
  CancelInvoiceButton,
} from "./invoice-detail-forms";

export const metadata: Metadata = { title: "Facture" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "finance:read")) return <AccessDenied />;

  const { id } = await params;
  const invoice = await getInvoice(user, id);
  if (!invoice) notFound();

  const canWrite = can(user, "finance:write");
  const canAudit = can(user, "audit:read");
  const late = isOverdue(invoice, todayParis());
  const remaining = fromCents(
    toCents(invoice.amountTTC) - toCents(invoice.paidTotal)
  );
  const isOpen = invoice.status === "EMISE" || invoice.status === "PARTIELLEMENT_PAYEE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="invoice-title">
          {invoice.number}
        </h1>
        <Badge variant={invoiceStatusVariant(invoice.status)} data-testid="invoice-status">
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
        {late ? <Badge variant="destructive">En retard</Badge> : null}
        <Link
          href={`/boutiques/${invoice.store.id}`}
          className="text-sm text-brand hover:underline"
        >
          {invoice.store.code} — {invoice.store.name}
        </Link>
        <div className="flex-1" />
        {canWrite && isOpen ? (
          <div className="flex gap-2">
            <AddPaymentDialog invoiceId={invoice.id} remaining={remaining} />
            <AddReminderDialog invoiceId={invoice.id} />
            {invoice.payments.length === 0 ? (
              <CancelInvoiceButton invoiceId={invoice.id} />
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {INVOICE_TYPE_LABELS[invoice.type]}
                {invoice.label ? ` — ${invoice.label}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Montant HT</dt>
                  <dd>{formatEUR(invoice.amountHT)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">
                    TVA ({invoice.vatRate} %)
                  </dt>
                  <dd>TTC : {formatEUR(invoice.amountTTC)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Payé</dt>
                  <dd>{formatEUR(invoice.paidTotal)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">
                    Restant dû
                  </dt>
                  <dd className="font-medium" data-testid="remaining-amount">
                    {formatEUR(remaining)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Émise le</dt>
                  <dd>{formatDateFr(invoice.issuedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Échéance</dt>
                  <dd>{formatDateFr(invoice.dueDate)}</dd>
                </div>
                {invoice.periodStart ? (
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Période</dt>
                    <dd>
                      {formatDateFr(invoice.periodStart)} →{" "}
                      {formatDateFr(invoice.periodEnd)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {invoice.notes ? (
                <p className="mt-4 whitespace-pre-wrap text-sm">{invoice.notes}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Paiements ({invoice.payments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun paiement.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Moyen</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDateFr(payment.paidAt)}</TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {payment.reference ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatEUR(payment.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relances ({invoice.reminders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune relance.</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="reminders-list">
                  {invoice.reminders.map((reminder) => (
                    <li
                      key={reminder.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                    >
                      <Badge variant={reminder.level >= 3 ? "destructive" : "warning"}>
                        Niveau {reminder.level}
                      </Badge>
                      <span>{REMINDER_CHANNEL_LABELS[reminder.channel]}</span>
                      <span className="text-muted-foreground">
                        {formatDateFr(reminder.sentAt)} par {reminder.sentBy.firstName}{" "}
                        {reminder.sentBy.lastName}
                      </span>
                      {reminder.notes ? (
                        <span className="text-muted-foreground">— {reminder.notes}</span>
                      ) : null}
                      {reminder.attachments.map((file) => (
                        <Button key={file.id} variant="outline" size="sm" asChild>
                          <a href={`/api/files/${file.id}`}>
                            <Download /> {file.originalName}
                          </a>
                        </Button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="invoices" recordId={invoice.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
