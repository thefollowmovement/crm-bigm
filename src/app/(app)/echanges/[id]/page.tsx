import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  EXCHANGE_STATUS_LABELS,
  EXCHANGE_TYPE_LABELS,
  ROLE_LABELS,
} from "@/lib/labels";
import { getExchange } from "@/services/exchanges.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { exchangeStatusVariant } from "../status-variant";
import { ReplyForm } from "./reply-form";
import { StatusButtons } from "./status-buttons";

export const metadata: Metadata = { title: "Échange" };

export default async function ExchangeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "exchange:read")) return <AccessDenied />;

  const { id } = await params;
  let exchange;
  try {
    exchange = await getExchange(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!exchange) notFound();

  const isSiege = user.role !== "FRANCHISE";
  const canWrite = can(user, "exchange:write");
  const canAudit = can(user, "audit:read");

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" data-testid="exchange-title">
            {exchange.subject}
          </h1>
          <Badge variant="secondary">{EXCHANGE_TYPE_LABELS[exchange.type]}</Badge>
          <Badge
            variant={exchangeStatusVariant(exchange.status)}
            data-testid="exchange-status"
          >
            {EXCHANGE_STATUS_LABELS[exchange.status]}
          </Badge>
          <Link
            href={`/boutiques/${exchange.store.id}`}
            className="text-sm text-brand hover:underline"
          >
            {exchange.store.code} — {exchange.store.name}
          </Link>
        </div>
        {canWrite && isSiege ? (
          <StatusButtons exchangeId={exchange.id} status={exchange.status} />
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Ouvert par {exchange.createdBy.firstName} {exchange.createdBy.lastName} le{" "}
        {dateFormat.format(exchange.createdAt)}
        {exchange.closedAt ? ` — clos le ${dateFormat.format(exchange.closedAt)}` : ""}
      </p>

      <Tabs defaultValue="discussion">
        <TabsList>
          <TabsTrigger value="discussion">
            Discussion ({exchange.messages.length})
          </TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="discussion" className="space-y-4">
          <ol className="space-y-3">
            {exchange.messages.map((message, index) => (
              <li
                key={message.id}
                data-testid={`message-${index + 1}`}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  message.isDecision && "border-emerald-500 border-l-4",
                  message.isInternal &&
                    "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {message.author.firstName} {message.author.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[message.author.role]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateFormat.format(message.createdAt)}
                  </span>
                  {message.isDecision ? (
                    <Badge variant="success">Décision</Badge>
                  ) : null}
                  {message.isInternal ? (
                    <Badge variant="warning">Note interne</Badge>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
                {message.attachments.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((file) => (
                      <li key={file.id}>
                        <a
                          href={`/api/files/${file.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:underline"
                        >
                          <Download className="size-3.5" /> {file.originalName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>

          {canWrite ? (
            exchange.status === "CLOS" ? (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                Échange clos — il doit être rouvert pour accepter de nouveaux
                messages.
              </p>
            ) : (
              <ReplyForm exchangeId={exchange.id} showSiegeOptions={isSiege} />
            )
          ) : null}
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="exchanges" recordId={exchange.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
