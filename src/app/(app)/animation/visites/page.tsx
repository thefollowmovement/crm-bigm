import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { VISIT_STATUS_LABELS, VISIT_TYPE_LABELS } from "@/lib/labels";
import {
  computeAuditScore,
  canManageCriteria,
  getAuditTrends,
  listCriteria,
  listVisits,
  type VisitFilters,
} from "@/services/visits.service";
import { auditMaxDays } from "@/lib/jobs/audit-overdue";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
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

import {
  CreateVisitDialog,
  CriterionDialog,
  ToggleCriterionButton,
  VisitListFilters,
} from "./visit-dialogs";

export const metadata: Metadata = { title: "Visites & audits" };

const VISIT_TYPES = Object.keys(VISIT_TYPE_LABELS);

export default async function VisitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "visit:read")) return <AccessDenied />;

  const params = await searchParams;
  const stores = await listStores(user);
  const storeId =
    typeof params.boutique === "string" &&
    stores.some((s) => s.id === params.boutique)
      ? params.boutique
      : undefined;
  const type =
    typeof params.type === "string" && VISIT_TYPES.includes(params.type)
      ? (params.type as (typeof VISIT_TYPES)[number])
      : undefined;

  const today = todayParis();
  const trendsFrom = `${addMonthsIso(today, -11).slice(0, 7)}-01`;

  const [visits, criteria, trends] = await Promise.all([
    listVisits(user, { storeId, type: type as VisitFilters["type"] }),
    listCriteria(user, { includeInactive: true }),
    getAuditTrends(user, { from: trendsFrom, to: today, storeId }),
  ]);

  const canWrite = can(user, "visit:write");
  const manageCriteria = canManageCriteria(user.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Visites &amp; audits terrain</h1>
          <p className="text-sm text-muted-foreground">
            Audits, visites de courtoisie, ouvertures et interventions — avec
            compte rendu et grille de notation.
          </p>
        </div>
        {canWrite ? (
          <CreateVisitDialog
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
          />
        ) : null}
      </div>

      <VisitListFilters
        stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        current={{ boutique: storeId ?? "", type: type ?? "" }}
      />

      <div className="rounded-xl border bg-card">
        <Table data-testid="visits-table">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Par</TableHead>
              <TableHead className="text-right">Note</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucune visite pour ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              visits.map((visit) => {
                const score = computeAuditScore(
                  visit.items.map((i) => ({
                    score: i.score,
                    maxScore: i.criterion.maxScore,
                  }))
                );
                return (
                  <TableRow key={visit.id}>
                    <TableCell>
                      <Link
                        href={`/animation/visites/${visit.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {formatDateFr(visit.visitDate)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {visit.store.code} — {visit.store.name}
                    </TableCell>
                    <TableCell>{VISIT_TYPE_LABELS[visit.type]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {visit.visitedBy.firstName} {visit.visitedBy.lastName}
                    </TableCell>
                    <TableCell className="text-right">
                      {visit.type === "AUDIT" && score !== null ? (
                        <Badge
                          variant={
                            score >= 80 ? "success" : score >= 60 ? "warning" : "destructive"
                          }
                        >
                          {String(score).replace(".", ",")} %
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={visit.status === "FINALISEE" ? "success" : "secondary"}
                      >
                        {VISIT_STATUS_LABELS[visit.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Tendance des audits{storeId ? " (boutique filtrée)" : " (réseau)"}{" "}
            <InfoHint
              text={`Une boutique ouverte sans audit finalisé depuis plus de ${auditMaxDays()} jours déclenche l'alerte « audit en retard » vers son animateur et la direction (job quotidien de 06h40, relance mensuelle — délai réglable via la variable d'environnement AUDIT_MAX_DAYS).`}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun audit finalisé sur les 12 derniers mois.
            </p>
          ) : (
            <div className="space-y-2">
              <TimeSeriesChart
                data={trends.map((t) => ({
                  label: formatMonthFr(t.month),
                  gross: t.scorePct ?? "0",
                }))}
                seriesLabel="Note moyenne"
                unit="percent"
                height={260}
                testId="audit-trends"
              />
              <p className="text-xs text-muted-foreground">
                Non-conformités relevées :{" "}
                {trends.reduce((sum, t) => sum + t.nonCompliantCount, 0)} sur{" "}
                {trends.reduce((sum, t) => sum + t.auditCount, 0)} audit(s)
                finalisé(s).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {manageCriteria ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Grille d&apos;audit (référentiel)</CardTitle>
            <CriterionDialog />
          </CardHeader>
          <CardContent>
            <Table data-testid="criteria-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Critère</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Barème</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteria.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Aucun critère — ajoutez-en pour pouvoir noter les audits.
                    </TableCell>
                  </TableRow>
                ) : (
                  criteria.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.category ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{c.maxScore} pts</TableCell>
                      <TableCell>
                        <Badge variant={c.isActive ? "success" : "secondary"}>
                          {c.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ToggleCriterionButton id={c.id} isActive={c.isActive} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
