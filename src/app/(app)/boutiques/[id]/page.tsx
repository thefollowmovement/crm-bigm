import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { toStoreDTO } from "@/lib/authz/field-visibility";
import {
  PLATFORM_LABELS,
  STORE_STATUS_LABELS,
  STORE_TYPE_LABELS,
} from "@/lib/labels";
import { getStore } from "@/services/stores.service";
import { listStoreContracts } from "@/services/contracts.service";
import { listExchanges } from "@/services/exchanges.service";
import { isOverdue, listStoreInvoices } from "@/services/invoices.service";
import { getStoreMonth } from "@/services/revenue.service";
import { REVENUE_CHANNEL_LABELS } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { todayParis } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from "@/lib/labels";
import { invoiceStatusVariant } from "@/app/(app)/finances/status-variant";
import { EXCHANGE_STATUS_LABELS, EXCHANGE_TYPE_LABELS } from "@/lib/labels";
import { exchangeStatusVariant } from "@/app/(app)/echanges/status-variant";
import { NewExchangeDialog } from "@/app/(app)/echanges/new-exchange-dialog";
import { formatDateFr } from "@/lib/dates";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "@/lib/labels";
import { CreateContractDialog } from "@/app/(app)/contrats/contract-form";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { StoreForm } from "../store-form";
import { loadStoreFormOptions } from "../form-options";
import { PlatformsEditor } from "./platforms-editor";
import { StoreAnimationTab } from "./animation-tab";
import { StorePurchasesTab } from "./purchases-tab";

export const metadata: Metadata = { title: "Fiche boutique" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export default async function FicheBoutiquePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "store:read")) return <AccessDenied />;

  const { id } = await params;
  let store;
  try {
    store = await getStore(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!store) notFound();

  const dto = toStoreDTO(store, user);
  const canWrite = can(user, "store:write");
  const canAudit = can(user, "audit:read");

  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
  const formatDate = (d: string | null) =>
    d ? dateFormat.format(new Date(`${d}T00:00:00`)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="store-title">
          {dto.code} — {dto.name}
        </h1>
        <Badge variant="secondary">{STORE_TYPE_LABELS[dto.type]}</Badge>
        <Badge variant={dto.status === "OUVERTE" ? "success" : "warning"}>
          {STORE_STATUS_LABELS[dto.status]}
        </Badge>
      </div>

      <Tabs defaultValue="infos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="infos">Informations</TabsTrigger>
          <TabsTrigger value="plateformes">Plateformes</TabsTrigger>
          {can(user, "contract:read") ? (
            <TabsTrigger value="contrats">Contrats</TabsTrigger>
          ) : null}
          {can(user, "exchange:read") ? (
            <TabsTrigger value="echanges">Échanges</TabsTrigger>
          ) : null}
          {can(user, "finance:read") ? (
            <TabsTrigger value="finances">Finances</TabsTrigger>
          ) : null}
          {can(user, "revenue:read") ? (
            <TabsTrigger value="ca">CA</TabsTrigger>
          ) : null}
          {can(user, "actionplan:read") ? (
            <TabsTrigger value="animation">Animation</TabsTrigger>
          ) : null}
          {can(user, "purchase:read") ? (
            <TabsTrigger value="achats">Achats</TabsTrigger>
          ) : null}
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="infos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info
                  label="Franchisé"
                  value={
                    store.franchisee ? (
                      can(user, "franchisee:read") || user.role === "FRANCHISE" ? (
                        <Link
                          href={`/franchises/${store.franchisee.id}`}
                          className="text-brand hover:underline"
                        >
                          {store.franchisee.companyName}
                        </Link>
                      ) : (
                        store.franchisee.companyName
                      )
                    ) : null
                  }
                />
                <Info
                  label="Animateur"
                  value={
                    store.animateur
                      ? `${store.animateur.firstName} ${store.animateur.lastName}`
                      : null
                  }
                />
                <Info label="SIRET" value={dto.siret} />
                <Info label="Adresse" value={dto.address} />
                <Info
                  label="Ville"
                  value={[dto.postalCode, dto.city].filter(Boolean).join(" ") || null}
                />
                <Info label="Région" value={dto.region} />
                <Info label="Téléphone" value={dto.phone} />
                <Info label="E-mail" value={dto.email} />
                <Info label="Ouverture" value={formatDate(dto.openingDate)} />
                {dto.closingDate ? (
                  <Info label="Fermeture" value={formatDate(dto.closingDate)} />
                ) : null}
              </dl>
              {"internalNotes" in dto && dto.internalNotes ? (
                <div className="mt-6 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                  <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Notes internes (siège)
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{dto.internalNotes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Modifier la fiche</CardTitle>
              </CardHeader>
              <CardContent>
                <StoreFormLoader dto={dto} canSeeInternalNotes={"internalNotes" in dto} />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {can(user, "contract:read") ? (
          <TabsContent value="contrats">
            <StoreContractsTab
              user={user}
              storeId={store.id}
              canWrite={can(user, "contract:write")}
            />
          </TabsContent>
        ) : null}

        {can(user, "exchange:read") ? (
          <TabsContent value="echanges">
            <StoreExchangesTab
              user={user}
              store={{ id: store.id, code: store.code, name: store.name }}
              canWrite={can(user, "exchange:write")}
            />
          </TabsContent>
        ) : null}

        {can(user, "finance:read") ? (
          <TabsContent value="finances">
            <StoreInvoicesTab user={user} storeId={store.id} />
          </TabsContent>
        ) : null}

        {can(user, "revenue:read") ? (
          <TabsContent value="ca">
            <StoreRevenueTab user={user} storeId={store.id} />
          </TabsContent>
        ) : null}

        {can(user, "actionplan:read") ? (
          <TabsContent value="animation">
            <StoreAnimationTab user={user} storeId={store.id} />
          </TabsContent>
        ) : null}

        {can(user, "purchase:read") ? (
          <TabsContent value="achats">
            <StorePurchasesTab user={user} storeId={store.id} />
          </TabsContent>
        ) : null}

        <TabsContent value="plateformes">
          <PlatformsEditor
            storeId={store.id}
            platforms={store.platforms.map((p) => ({
              platform: p.platform,
              label: p.label,
              accountRef: p.accountRef,
              isActive: p.isActive,
            }))}
            labels={PLATFORM_LABELS}
            readOnly={!canWrite}
          />
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="stores" recordId={store.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

async function StoreContractsTab({
  user,
  storeId,
  canWrite,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  storeId: string;
  canWrite: boolean;
}) {
  const contracts = await listStoreContracts(user, storeId);
  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <CreateContractDialog storeId={storeId} />
        </div>
      ) : null}
      {contracts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun contrat pour cette boutique.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="store-contracts">
          {contracts.map((contract) => (
            <li
              key={contract.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
            >
              <Link
                href={`/contrats/${contract.id}`}
                className="font-medium text-brand hover:underline"
              >
                {CONTRACT_TYPE_LABELS[contract.type]}
                {contract.reference ? ` — ${contract.reference}` : ""}
              </Link>
              <Badge variant={contract.status === "ACTIF" ? "success" : "secondary"}>
                {CONTRACT_STATUS_LABELS[contract.status]}
              </Badge>
              {contract.parentContract ? (
                <span className="text-xs text-muted-foreground">
                  avenant de {contract.parentContract.reference ?? "contrat"}
                </span>
              ) : null}
              <span className="ml-auto text-muted-foreground">
                {formatDateFr(contract.startDate)} → {formatDateFr(contract.endDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function StoreExchangesTab({
  user,
  store,
  canWrite,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  store: { id: string; code: string; name: string };
  canWrite: boolean;
}) {
  const rows = await listExchanges(user, { storeId: store.id });
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeZone: "Europe/Paris",
  });
  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <NewExchangeDialog stores={[store]} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun échange pour cette boutique.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="store-exchanges">
          {rows.map((exchange) => (
            <li
              key={exchange.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
            >
              <Link
                href={`/echanges/${exchange.id}`}
                className="font-medium text-brand hover:underline"
              >
                {exchange.subject}
              </Link>
              <Badge variant="secondary">{EXCHANGE_TYPE_LABELS[exchange.type]}</Badge>
              <Badge variant={exchangeStatusVariant(exchange.status)}>
                {EXCHANGE_STATUS_LABELS[exchange.status]}
              </Badge>
              <span className="ml-auto text-muted-foreground">
                {exchange.messageCount} message{exchange.messageCount > 1 ? "s" : ""}
                {exchange.lastMessageAt
                  ? ` — dernier le ${dateFormat.format(exchange.lastMessageAt)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function StoreInvoicesTab({
  user,
  storeId,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  storeId: string;
}) {
  const rows = await listStoreInvoices(user, storeId);
  const today = todayParis();
  return rows.length === 0 ? (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Aucune facture pour cette boutique.
    </p>
  ) : (
    <ul className="space-y-2" data-testid="store-invoices">
      {rows.map((invoice) => (
        <li
          key={invoice.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
        >
          <Link
            href={`/finances/${invoice.id}`}
            className="font-medium text-brand hover:underline"
          >
            {invoice.number}
          </Link>
          <span className="text-muted-foreground">
            {INVOICE_TYPE_LABELS[invoice.type]}
            {invoice.label ? ` — ${invoice.label}` : ""}
          </span>
          <Badge variant={invoiceStatusVariant(invoice.status)}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </Badge>
          {isOverdue(invoice, today) ? (
            <Badge variant="destructive">En retard</Badge>
          ) : null}
          <span className="ml-auto font-medium">{formatEUR(invoice.amountTTC)}</span>
        </li>
      ))}
    </ul>
  );
}

async function StoreRevenueTab({
  user,
  storeId,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  storeId: string;
}) {
  const month = todayParis().slice(0, 7);
  const data = await getStoreMonth(user, storeId, month);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mois en cours ({month}) — total :{" "}
          <span className="font-semibold text-foreground">
            {formatEUR(data.grandTotal)}
          </span>
        </p>
        <Link
          href={`/ca?boutique=${storeId}`}
          className="text-sm text-brand hover:underline"
        >
          Saisie et historique complet →
        </Link>
      </div>
      {data.totals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune donnée ce mois-ci.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {data.totals.map((t) => (
            <div key={t.channel} className="rounded-lg border bg-card p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {REVENUE_CHANNEL_LABELS[t.channel]}
              </div>
              <div className="font-semibold">{formatEUR(t.gross)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function StoreFormLoader({
  dto,
  canSeeInternalNotes,
}: {
  dto: ReturnType<typeof toStoreDTO>;
  canSeeInternalNotes: boolean;
}) {
  const options = await loadStoreFormOptions();
  return (
    <StoreForm
      store={dto}
      franchisees={options.franchisees}
      animateurs={options.animateurs}
      canSeeInternalNotes={canSeeInternalNotes}
    />
  );
}
