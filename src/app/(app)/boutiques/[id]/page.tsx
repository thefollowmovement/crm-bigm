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
import { getProjectForStore } from "@/services/openings.service";
import { listStoreContracts } from "@/services/contracts.service";
import { listExchanges } from "@/services/exchanges.service";
import { listInvoicesForStore } from "@/services/acct-invoices.service";
import { formatEUR } from "@/lib/money";
import { todayParis } from "@/lib/dates";
import {
  ACCT_CLASS_LABELS,
  ACCT_INVOICE_STATUS_LABELS,
  ACCT_PIECE_TYPE_LABELS,
} from "@/lib/labels";
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
import { StorePhotoCard } from "./photo-card";
import { PlatformsEditor } from "./platforms-editor";
import { StoreAnimationTab } from "./animation-tab";
import { StorePurchasesTab } from "./purchases-tab";
import { StoreRentabilityTab } from "./rentability-tab";

export const metadata: Metadata = { title: "Fiche boutique" };

// Carte OpenStreetMap embarquée (chargée par le navigateur, aucun appel
// réseau au build) + lien vers la carte complète.
function StoreMap({ latitude, longitude }: { latitude: string; longitude: string }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const d = 0.005;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${lat},${lon}`;
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

  return (
    <div className="space-y-2">
      <iframe
        src={embed}
        title="Carte OpenStreetMap"
        className="h-48 w-full rounded-lg border"
        loading="lazy"
        data-testid="osm-map"
      />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {latitude}, {longitude}
        </span>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand underline-offset-2 hover:underline"
          data-testid="osm-link"
        >
          Voir sur OpenStreetMap →
        </a>
      </div>
    </div>
  );
}

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
  const openingProject = await getProjectForStore(user, store.id);

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

      {openingProject && openingProject.status === "EN_COURS" ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
          data-testid="opening-banner"
        >
          <Badge variant="secondary">Ouverture en cours</Badge>
          <span>
            {openingProject.progress.done}/{openingProject.progress.total} jalons
            terminés ({openingProject.progress.pct} %)
          </span>
          <Link
            href={`/developpement/ouvertures/${openingProject.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            Voir le projet →
          </Link>
        </div>
      ) : null}

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
          {can(user, "accounting:read") ? (
            <TabsTrigger value="compta">Comptabilité</TabsTrigger>
          ) : null}
          {can(user, "actionplan:read") ? (
            <TabsTrigger value="animation">Animation</TabsTrigger>
          ) : null}
          {can(user, "purchase:read") ? (
            <TabsTrigger value="achats">Achats</TabsTrigger>
          ) : null}
          {dto.type === "SUCCURSALE" && can(user, "branch:read") ? (
            <TabsTrigger value="rentabilite">Rentabilité</TabsTrigger>
          ) : null}
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="infos" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Photo</CardTitle>
              </CardHeader>
              <CardContent>
                <StorePhotoCard
                  storeId={store.id}
                  photoFileId={store.photoFileId}
                  storeName={dto.name}
                  canWrite={canWrite}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Localisation</CardTitle>
              </CardHeader>
              <CardContent>
                {dto.latitude && dto.longitude ? (
                  <StoreMap latitude={dto.latitude} longitude={dto.longitude} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Coordonnées GPS non renseignées
                    {canWrite ? " — ajoutez-les dans le formulaire ci-dessous." : "."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

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

        {can(user, "accounting:read") ? (
          <TabsContent value="compta">
            <StoreJournalTab user={user} storeId={store.id} />
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

        {dto.type === "SUCCURSALE" && can(user, "branch:read") ? (
          <TabsContent value="rentabilite">
            <StoreRentabilityTab user={user} storeId={store.id} />
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

// Pièces du journal comptable des structures rattachées à la boutique
// (étape 52 — remplace les anciens onglets Finances et CA).
async function StoreJournalTab({
  user,
  storeId,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  storeId: string;
}) {
  const rows = await listInvoicesForStore(user, storeId);
  const today = todayParis();
  const STATUS_BADGES: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
    PAYEE: "success",
    EN_ATTENTE: "secondary",
    EN_RETARD: "destructive",
    IMPAYEE: "destructive",
    ANNULEE: "outline",
  };
  return rows.length === 0 ? (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Aucune pièce du journal pour cette boutique — rattachez sa structure
      comptable (fiche client comptable → champ « Boutique liée »).
    </p>
  ) : (
    <ul className="space-y-2" data-testid="store-invoices">
      {rows.map((invoice) => {
        const overdue =
          invoice.dueDate !== null &&
          invoice.dueDate < today &&
          (invoice.status === "EN_ATTENTE" ||
            invoice.status === "EN_RETARD" ||
            invoice.status === "IMPAYEE");
        return (
          <li
            key={invoice.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
          >
            <Link
              href={`/compta/structures/${invoice.structure.id}`}
              className="font-mono font-medium text-brand hover:underline"
            >
              {invoice.pieceNumber}
            </Link>
            <span className="text-muted-foreground">
              {ACCT_PIECE_TYPE_LABELS[invoice.pieceType]} ·{" "}
              {ACCT_CLASS_LABELS[invoice.accountClass]}
            </span>
            <Badge variant={STATUS_BADGES[invoice.status] ?? "secondary"}>
              {ACCT_INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
            {overdue ? <Badge variant="destructive">Échéance dépassée</Badge> : null}
            <span className="ml-auto font-medium">
              {formatEUR(invoice.amountTTC)}
            </span>
          </li>
        );
      })}
    </ul>
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
