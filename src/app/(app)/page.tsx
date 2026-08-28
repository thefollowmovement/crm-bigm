import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { formatMonthFr } from "@/lib/analytics";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { ROLE_LABELS } from "@/lib/labels";
import {
  getAnimateurDashboard,
  getNetworkDashboard,
  getStoreDashboard,
} from "@/services/dashboard.service";
import { getMonthlyResults } from "@/services/acct-analytics.service";
import { listStores } from "@/services/stores.service";
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
import { TimeSeriesChart } from "@/components/charts/charts";

import { DashboardAgenda } from "./dashboard-agenda";
import { StoreFilter } from "./dashboard-filters";

export const metadata: Metadata = { title: "Tableau de bord" };

type Params = Record<string, string | string[] | undefined>;

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">N-1 : —</span>;
  return (
    <Badge variant={delta >= 0 ? "success" : "destructive"}>
      {delta >= 0 ? "+" : ""}
      {String(delta).replace(".", ",")} % vs N-1
    </Badge>
  );
}

function Kpi({
  label,
  value,
  extra,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  extra?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {extra ? <div className="mt-1">{extra}</div> : null}
      </CardContent>
    </Card>
  );
}

// Évolution mensuelle du CA HT (classe 7 du journal comptable — étape 52).
async function MonthChart({ user, title }: { user: SessionUser; title: string }) {
  const today = todayParis();
  const series = await getMonthlyResults(user, {
    from: `${addMonthsIso(today, -11).slice(0, 7)}-01`,
    to: today,
  });
  if (series.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart
          data={series.map((p) => ({
            label: formatMonthFr(p.month),
            gross: p.revenueHT,
          }))}
          seriesLabel="CA HT"
          height={260}
          testId="dashboard-chart"
        />
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="dashboard-title">
          Bonjour {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Connecté en tant que {ROLE_LABELS[user.role] ?? user.role}
        </p>
      </div>

      {user.role === "FRANCHISE" ? (
        <FranchiseDashboard user={user} params={params} />
      ) : user.role === "ANIMATION" ? (
        <AnimateurDashboard user={user} />
      ) : user.role === "SALARIE" ? (
        <SalarieDashboard />
      ) : (
        <NetworkDashboard user={user} />
      )}
    </div>
  );
}

// ── Vue Salarié : renvoi vers l'espace pointeuse/congés ──────────

function SalarieDashboard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-2 pt-6">
        <p className="text-sm text-muted-foreground">
          Votre pointeuse, vos heures et vos demandes de congés sont dans votre
          espace personnel.
        </p>
        <Link
          href="/mon-espace"
          className="text-sm font-medium underline-offset-2 hover:underline"
          data-testid="goto-mon-espace"
        >
          Ouvrir mon espace →
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Vue Boutique (franchisé) ─────────────────────────────────────

async function FranchiseDashboard({
  user,
  params,
}: {
  user: SessionUser;
  params: Params;
}) {
  const stores = await listStores(user);
  if (stores.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Aucune boutique rattachée à votre compte.
      </p>
    );
  }
  const storeId =
    typeof params.boutique === "string" && stores.some((s) => s.id === params.boutique)
      ? params.boutique
      : stores[0].id;
  const store = stores.find((s) => s.id === storeId)!;
  const data = await getStoreDashboard(user, storeId);

  return (
    <div className="space-y-6" data-testid="store-dashboard">
      {stores.length > 1 ? (
        <StoreFilter
          stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
          current={storeId}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans ? (
          <Kpi
            label="Plans d'action ouverts"
            value={data.plans.open}
            testId="kpi-plans"
            extra={
              data.plans.late > 0 ? (
                <Badge variant="destructive">{data.plans.late} en retard</Badge>
              ) : null
            }
          />
        ) : null}
        {data.lastAudit ? (
          <Kpi
            label="Dernier audit"
            value={
              data.lastAudit.scorePct !== null
                ? `${String(data.lastAudit.scorePct).replace(".", ",")} %`
                : "—"
            }
            extra={
              <span className="text-xs text-muted-foreground">
                le {formatDateFr(data.lastAudit.visitDate)}
              </span>
            }
          />
        ) : null}
        <Kpi
          label="Boutique"
          value={store.code}
          extra={
            <Link
              href={`/boutiques/${store.id}`}
              className="text-xs font-medium underline-offset-2 hover:underline"
            >
              Voir la fiche
            </Link>
          }
        />
      </div>

      <DashboardAgenda user={user} />
    </div>
  );
}

// ── Vue Animateur ────────────────────────────────────────────────

async function AnimateurDashboard({ user }: { user: SessionUser }) {
  const data = await getAnimateurDashboard(user);

  return (
    <div className="space-y-6" data-testid="animateur-dashboard">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Mes boutiques" value={data.stores.length} />
        <Kpi
          label="Plans d'action en retard"
          value={data.latePlans}
          extra={
            data.latePlans > 0 ? (
              <Link
                href="/animation/plans-action"
                className="text-xs font-medium underline-offset-2 hover:underline"
              >
                Voir les plans
              </Link>
            ) : null
          }
        />
        <Kpi
          label="Créneaux planifiés cette semaine"
          value={data.weekEntries}
          extra={
            <Link
              href="/animation/planning"
              className="text-xs font-medium underline-offset-2 hover:underline"
            >
              Ouvrir le planning
            </Link>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes boutiques</CardTitle>
        </CardHeader>
        <CardContent>
          {data.stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune boutique ne vous est rattachée.
            </p>
          ) : (
            <Table data-testid="animateur-stores">
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Ville</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <Link
                        href={`/boutiques/${store.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {store.code} — {store.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {store.city ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DashboardAgenda user={user} />
    </div>
  );
}

// ── Vue Réseau (direction et rôles siège) ────────────────────────

async function NetworkDashboard({ user }: { user: SessionUser }) {
  const data = await getNetworkDashboard(user);
  if (!data) return null;

  const today = todayParis();
  const canAccounting = can(user, "accounting:read");

  return (
    <div className="space-y-6" data-testid="network-dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.revenue ? (
          <Kpi
            label={`CA HT — ${formatMonthFr(data.month)}`}
            value={formatEUR(data.revenue.current)}
            extra={<DeltaBadge delta={data.revenue.deltaPct} />}
            testId="kpi-revenue"
          />
        ) : null}
        {data.unpaid ? (
          <Kpi
            label="Restant dû (journal)"
            value={formatEUR(data.unpaid.totalTTC)}
            extra={
              <span className="text-xs text-muted-foreground">
                {data.unpaid.count} pièce{data.unpaid.count > 1 ? "s" : ""} —{" "}
                <Link
                  href="/compta/factures"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  voir
                </Link>
              </span>
            }
            testId="kpi-unpaid"
          />
        ) : null}
        {data.lateTickets !== null ? (
          <Kpi
            label="Tickets en retard"
            value={data.lateTickets}
            extra={
              <span className="text-xs text-muted-foreground">
                au {formatDateFr(today)}
              </span>
            }
          />
        ) : null}
        {data.latePlans !== null || data.auditsOverdue !== null ? (
          <Kpi
            label="Suivi terrain"
            value={
              data.latePlans !== null ? `${data.latePlans} plan(s) en retard` : "—"
            }
            extra={
              data.auditsOverdue !== null ? (
                <span className="text-xs text-muted-foreground">
                  {data.auditsOverdue} boutique(s) sans audit récent
                </span>
              ) : null
            }
          />
        ) : null}
      </div>

      {canAccounting && data.topStores.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Meilleures boutiques du mois (CA facturé)</CardTitle>
            </CardHeader>
            <CardContent>
              <RankingTable rows={data.topStores} testId="top-stores" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Boutiques en difficulté</CardTitle>
            </CardHeader>
            <CardContent>
              <RankingTable rows={data.flopStores} testId="flop-stores" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canAccounting ? (
        <MonthChart user={user} title="Évolution du CA (journal comptable)" />
      ) : null}

      <DashboardAgenda user={user} />
    </div>
  );
}

function RankingTable({
  rows,
  testId,
}: {
  rows: { storeId: string; code: string; name: string; gross: string }[];
  testId: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée ce mois-ci.</p>;
  }
  return (
    <Table data-testid={testId}>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.storeId}>
            <TableCell>
              <Link
                href={`/boutiques/${row.storeId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {row.code} — {row.name}
              </Link>
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatEUR(row.gross)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
