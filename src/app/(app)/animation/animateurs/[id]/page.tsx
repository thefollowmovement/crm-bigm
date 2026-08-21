import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import {
  canEditPlanning,
  getAnimateur,
  getAnimateurStats,
} from "@/services/planning.service";
import { getAuditTrends } from "@/services/visits.service";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeSeriesChart } from "@/components/charts/charts";

import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "Fiche animateur" };

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export default async function AnimateurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "planning:read")) return <AccessDenied />;

  const { id } = await params;
  const animateur = await getAnimateur(user, id);
  if (!animateur) notFound();

  const today = todayParis();
  const monthStart = `${today.slice(0, 7)}-01`;
  const trendsFrom = `${addMonthsIso(today, -11).slice(0, 7)}-01`;
  const [stats, trends] = await Promise.all([
    getAnimateurStats(user, id, { from: monthStart, to: today }),
    getAuditTrends(user, { from: trendsFrom, to: today, visitedById: id }),
  ]);

  const editable = can(user, "planning:write") && canEditPlanning(user, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {animateur.firstName} {animateur.lastName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {animateur.email}
          {animateur.profile?.zone ? ` · zone ${animateur.profile.zone}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="animateur-stats">
        <Stat label="Boutiques suivies" value={animateur.stores.length} />
        <Stat
          label="Km planifiés (mois en cours)"
          value={`${stats.kmPlanned.replace(".", ",")} km`}
        />
        <Stat
          label="Coût estimé (mois)"
          value={stats.estimatedCost ? formatEUR(stats.estimatedCost) : "—"}
        />
        <Stat
          label="Visites du mois"
          value={`${stats.visitsDone} finalisée${stats.visitsDone > 1 ? "s" : ""} / ${stats.visitsTotal}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fiche</CardTitle>
          </CardHeader>
          <CardContent>
            {editable ? (
              <ProfileForm userId={animateur.id} profile={animateur.profile} />
            ) : (
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Zone</dt>
                  <dd>{animateur.profile?.zone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Itinéraire théorique
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {animateur.profile?.theoreticalRoute ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Coût kilométrique</dt>
                  <dd>
                    {animateur.profile?.costPerKm
                      ? `${animateur.profile.costPerKm.replace(".", ",")} €/km`
                      : "—"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Boutiques suivies</CardTitle>
          </CardHeader>
          <CardContent>
            {animateur.stores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune boutique.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {animateur.stores.map((store) => (
                  <li key={store.id}>
                    <Link
                      href={`/boutiques/${store.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {store.code} — {store.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {store.city ?? "—"}
                      {store.region ? ` (${store.region})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes d&apos;audit (12 derniers mois)</CardTitle>
        </CardHeader>
        <CardContent>
          {trends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun audit finalisé sur la période.
            </p>
          ) : (
            <TimeSeriesChart
              data={trends.map((t) => ({
                label: formatMonthFr(t.month),
                gross: t.scorePct ?? "0",
              }))}
              seriesLabel="Note moyenne"
              unit="percent"
              height={240}
              testId="animateur-trends"
            />
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Planning détaillé :{" "}
        <Link
          href="/animation/planning"
          className="font-medium underline-offset-2 hover:underline"
        >
          voir la semaine en cours
        </Link>{" "}
        (au {formatDateFr(today)}).
      </p>
    </div>
  );
}
