import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import {
  getProviderInvoice,
  listInvoiceMessages,
} from "@/services/providers.service";
import {
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_PIECE_TYPE_LABELS,
} from "@/lib/labels";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceMessages } from "@/components/invoice-messages";

import { ProviderMessageForm } from "../../provider-components";

export const metadata: Metadata = { title: "Ma facture" };

const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  PAYEE: "success",
  EN_ATTENTE: "secondary",
  EN_RETARD: "destructive",
  IMPAYEE: "destructive",
  ANNULEE: "outline",
};

export default async function ProviderInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "provider:portal")) return <AccessDenied />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const invoice = await getProviderInvoice(user, id);
  if (!invoice) notFound();
  const messages = await listInvoiceMessages(user, id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/prestataire" className="hover:underline">
            Espace prestataire
          </Link>{" "}
          / pièce <span className="font-mono">{invoice.pieceNumber}</span>
        </p>
        <h1
          className="flex flex-wrap items-center gap-2 text-2xl font-semibold"
          data-testid="provider-invoice-title"
        >
          {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]} {invoice.pieceNumber}
          <Badge variant={STATUS_BADGES[invoice.status] ?? "secondary"}>
            {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
          </Badge>
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Date</dt>
              <dd>{formatDateFr(invoice.pieceDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Échéance</dt>
              <dd>{invoice.dueDate ? formatDateFr(invoice.dueDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Total HT</dt>
              <dd className="tabular-nums">{formatEUR(invoice.amountHT)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Total TTC</dt>
              <dd className="font-medium tabular-nums">
                {formatEUR(invoice.amountTTC)}
              </dd>
            </div>
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
          <CardTitle>Discussion avec la comptabilité</CardTitle>
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
            mineIsProvider
          />
          <ProviderMessageForm invoiceId={invoice.id} />
        </CardContent>
      </Card>
    </div>
  );
}
