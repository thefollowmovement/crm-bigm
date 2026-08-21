import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import { getDirectionCockpit } from "@/services/dashboard.service";
import { getSeries } from "@/services/revenue-analytics.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeSeriesChart } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Cockpit Direction" };

function Kpi({
  label,
  value,
  href,
  extra,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  href: string;
  extra?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:bg-accent/50" data-testid={testId}>
        <CardContent className="pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
          {extra ? <div className="mt-1 text-xs text-muted-foreground">{extra}</div> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function CockpitPage() {
  const user = await requireUser();
  if (!can(user, "direction:cockpit")) return <AccessDenied />;

  const today = todayParis();
  const [cockpit, series] = await Promise.all([
    getDirectionCockpit(user),
    getSeries(user, {
      granularity: "month",
      from: `${addMonthsIso(today, -11).slice(0, 7)}-01`,
      to: today,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="cockpit-title">
          Cockpit Direction
        </h1>
        <p className="text-sm text-muted-foreground">
          Tous les indicateurs du réseau — {formatMonthFr(cockpit.month)}. Chaque
          carte ouvre le module concerné.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="CA réseau (mois)"
          value={formatEUR(cockpit.revenue.current)}
          href="/ca"
          testId="kpi-network-revenue"
          extra={
            cockpit.revenue.deltaPct === null
              ? "N-1 : —"
              : `${cockpit.revenue.deltaPct >= 0 ? "+" : ""}${String(
                  cockpit.revenue.deltaPct
                ).replace(".", ",")} % vs N-1`
          }
        />
        <Kpi
          label="Redevances facturées (année)"
          value={formatEUR(cockpit.royalties.invoiced)}
          href="/finances"
          extra={`Encaissées : ${formatEUR(cockpit.royalties.collected)}`}
        />
        <Kpi
          label="Factures en retard"
          value={cockpit.overdueInvoices.count}
          href="/finances?statut=EMISE"
          testId="kpi-overdue"
          extra={formatEUR(cockpit.overdueInvoices.total)}
        />
        <Kpi
          label="Achats DPS (mois)"
          value={formatEUR(cockpit.purchasesMonth)}
          href="/achats"
        />
        <Kpi
          label="Plans d'action en retard"
          value={cockpit.latePlans}
          href="/animation/plans-action"
          testId="kpi-late-plans"
        />
        <Kpi
          label="Audits en retard"
          value={cockpit.auditsOverdue}
          href="/animation/visites"
        />
        <Kpi
          label="Tickets ouverts"
          value={cockpit.openTickets}
          href="/tickets"
        />
        <Kpi
          label="Contrats à échéance (180 j)"
          value={cockpit.expiringContracts}
          href="/contrats"
        />
        <Kpi
          label="Ouvertures en cours"
          value={cockpit.openings.active}
          href="/developpement/ouvertures"
          extra={`${cockpit.openings.lateSteps} jalon(s) en retard`}
        />
        <Kpi
          label="Pipeline prospects"
          value={cockpit.prospects.count}
          href="/developpement/prospects"
          extra={`${cockpit.prospects.due} à relancer`}
        />
        <Kpi
          label="Cessions actives"
          value={cockpit.activeResales}
          href="/developpement/cessions"
        />
        <Kpi
          label="Écart matière (M-1)"
          value={
            cockpit.materialVariance.rows.length === 0
              ? "—"
              : formatEUR(cockpit.materialVariance.rows[0].variance)
          }
          href="/foodcost"
          testId="kpi-material-variance"
          extra={
            cockpit.materialVariance.rows.length === 0
              ? "Aucune boutique évaluable"
              : `${cockpit.materialVariance.rows[0].store.code} — le plus fort écart`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>CA réseau — 12 derniers mois</CardTitle>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée.</p>
            ) : (
              <TimeSeriesChart
                data={series.map((p) => ({
                  label: formatMonthFr(p.period),
                  gross: p.gross,
                }))}
                seriesLabel="CA brut"
                height={280}
                testId="cockpit-chart"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top / flop boutiques ({formatMonthFr(cockpit.month)})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Top
              </div>
              <ul className="space-y-1" data-testid="cockpit-top">
                {cockpit.topStores.map((s) => (
                  <li key={s.storeId} className="flex justify-between gap-2">
                    <Link
                      href={`/boutiques/${s.storeId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {s.code} — {s.name}
                    </Link>
                    <span className="font-medium">{formatEUR(s.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Flop
              </div>
              <ul className="space-y-1" data-testid="cockpit-flop">
                {cockpit.flopStores.map((s) => (
                  <li key={s.storeId} className="flex justify-between gap-2">
                    <Link
                      href={`/boutiques/${s.storeId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {s.code} — {s.name}
                    </Link>
                    <span>{formatEUR(s.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {cockpit.materialVariance.rows.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Écart matière {formatMonthFr(cockpit.materialVariance.month)}
                </div>
                <ul className="space-y-1" data-testid="cockpit-variance">
                  {cockpit.materialVariance.rows.map((row) => (
                    <li key={row.store.id} className="flex justify-between gap-2">
                      <span>{row.store.code}</span>
                      <span className="flex items-center gap-2">
                        {formatEUR(row.variance)}
                        {row.variancePct !== null ? (
                          <Badge
                            variant={
                              Math.abs(row.variancePct) > 15
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {String(row.variancePct).replace(".", ",")} %
                          </Badge>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
