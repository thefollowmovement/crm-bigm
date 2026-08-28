import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { getInvoice } from "@/services/acct-invoices.service";
import { listInvoiceMessages } from "@/services/providers.service";
import {
  ACCT_CLASS_LABELS,
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_INVOICE_TYPE_LABELS,
  ACCT_PIECE_TYPE_LABELS,
  ACCT_SOURCE_LABELS,
} from "@/lib/labels";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceMessages } from "@/components/invoice-messages";

import {
  EditInvoiceDialog,
  InvoiceAttachmentsDialog,
  InvoiceReminderDialog,
} from "../invoice-dialogs";
import { ComptaMessageForm } from "../detail-components";

export const metadata: Metadata = { title: "Pièce comptable" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  PAYEE: "success",
  EN_ATTENTE: "secondary",
  EN_RETARD: "destructive",
  IMPAYEE: "destructive",
  ANNULEE: "outline",
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <AccessDenied />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const invoice = await getInvoice(user, id);
  if (!invoice) notFound();
  const messages = await listInvoiceMessages(user, id);
  const canWrite = can(user, "accounting:write");
  const unsold =
    invoice.status === "EN_ATTENTE" ||
    invoice.status === "EN_RETARD" ||
    invoice.status === "IMPAYEE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/compta/factures" className="hover:underline">
              Journal factures
            </Link>{" "}
            / <span className="font-mono">{invoice.pieceNumber}</span>
          </p>
          <h1
            className="flex flex-wrap items-center gap-2 text-2xl font-semibold"
            data-testid="invoice-detail-title"
          >
            {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]} {invoice.pieceNumber}
            <Badge variant={STATUS_BADGES[invoice.status] ?? "secondary"}>
              {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
            {invoice.invoiceType === "RFA" ? (
              <Badge variant="outline">RFA</Badge>
            ) : null}
          </h1>
        </div>
        {canWrite ? (
          <div className="flex items-center gap-1">
            {unsold ? (
              <InvoiceReminderDialog
                invoice={{
                  id: invoice.id,
                  pieceNumber: invoice.pieceNumber,
                  structureEmail: invoice.structure.email,
                  lastReminderLevel: invoice.lastReminderLevel,
                }}
              />
            ) : null}
            <InvoiceAttachmentsDialog
              invoice={{ id: invoice.id, pieceNumber: invoice.pieceNumber }}
              attachments={invoice.attachments}
              canWrite={canWrite}
            />
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
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail de la pièce</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoRow
              label="Structure"
              value={
                <Link
                  href={`/compta/structures/${invoice.structure.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  <span className="font-mono text-xs">{invoice.structure.code}</span>{" "}
                  {invoice.structure.name}
                </Link>
              }
            />
            <InfoRow
              label="Classe"
              value={ACCT_CLASS_LABELS[invoice.accountClass]}
            />
            <InfoRow
              label="Type de facture"
              value={ACCT_INVOICE_TYPE_LABELS[invoice.invoiceType]}
            />
            <InfoRow label="Source" value={ACCT_SOURCE_LABELS[invoice.source]} />
            <InfoRow label="Date" value={formatDateFr(invoice.pieceDate)} />
            <InfoRow
              label="Échéance"
              value={invoice.dueDate ? formatDateFr(invoice.dueDate) : null}
            />
            <InfoRow label="Total HT" value={formatEUR(invoice.amountHT)} />
            <InfoRow label="Total TTC" value={formatEUR(invoice.amountTTC)} />
            <InfoRow label="Libellé" value={invoice.label} />
            <InfoRow
              label="Dernière relance"
              value={
                invoice.lastReminderLevel
                  ? `Niveau ${invoice.lastReminderLevel}`
                  : null
              }
            />
            <InfoRow label="Notes internes" value={invoice.notes} />
          </dl>
          {invoice.attachments.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs uppercase text-muted-foreground">
                Documents
              </div>
              <ul className="mt-1 list-inside list-disc text-sm">
                {invoice.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/files/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {a.originalName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discussion avec le prestataire</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InvoiceMessages
            messages={messages.map((m) => ({
              id: m.id,
              body: m.body,
              createdAt: m.createdAt,
              authorName: `${m.author.firstName} ${m.author.lastName}`,
              fromProvider: m.author.role === "PRESTATAIRE",
            }))}
            mineIsProvider={false}
          />
          <ComptaMessageForm invoiceId={invoice.id} />
        </CardContent>
      </Card>
    </div>
  );
}
