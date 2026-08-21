import Link from "next/link";

import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import {
  ACTION_PLAN_STATUS_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_TYPE_LABELS,
} from "@/lib/labels";
import {
  computeAuditScore,
  getAuditTrends,
  listVisits,
} from "@/services/visits.service";
import {
  formatPlanNumber,
  isPlanLate,
  listPlans,
} from "@/services/action-plans.service";
import { listTrainings } from "@/services/trainings.service";
import { TRAINING_STATUS_LABELS, TRAINING_TYPE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Onglet « Animation » de la fiche boutique : dernières visites, note
// d'audit moyenne et plans d'action ouverts. Le franchisé ne voit que les
// plans d'action (les comptes rendus de visite restent internes).
export async function StoreAnimationTab({
  user,
  storeId,
}: {
  user: SessionUser;
  storeId: string;
}) {
  const today = todayParis();
  const canSeeVisits = can(user, "visit:read");

  const [visits, trends, plans, trainings] = await Promise.all([
    canSeeVisits ? listVisits(user, { storeId }) : Promise.resolve([]),
    canSeeVisits
      ? getAuditTrends(user, {
          from: `${addMonthsIso(today, -11).slice(0, 7)}-01`,
          to: today,
          storeId,
        })
      : Promise.resolve([]),
    listPlans(user, { storeId }),
    listTrainings(user, { storeId }),
  ]);

  const openPlans = plans.filter(
    (p) => p.status === "A_FAIRE" || p.status === "EN_COURS" || p.status === "TERMINE"
  );

  return (
    <div className="space-y-6" data-testid="store-animation-tab">
      {canSeeVisits ? (
        <Card>
          <CardHeader>
            <CardTitle>Dernières visites</CardTitle>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune visite enregistrée.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {visits.slice(0, 5).map((visit) => {
                  const score = computeAuditScore(
                    visit.items.map((i) => ({
                      score: i.score,
                      maxScore: i.criterion.maxScore,
                    }))
                  );
                  return (
                    <li key={visit.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/animation/visites/${visit.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {formatDateFr(visit.visitDate)} —{" "}
                        {VISIT_TYPE_LABELS[visit.type]}
                      </Link>
                      <Badge
                        variant={visit.status === "FINALISEE" ? "success" : "secondary"}
                      >
                        {VISIT_STATUS_LABELS[visit.status]}
                      </Badge>
                      {visit.type === "AUDIT" && score !== null ? (
                        <span className="text-muted-foreground">
                          note {String(score).replace(".", ",")} %
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {trends.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {trends.reduce((sum, t) => sum + t.nonCompliantCount, 0)}{" "}
                non-conformité(s) relevée(s) sur les 12 derniers mois.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Formations</CardTitle>
        </CardHeader>
        <CardContent>
          {trainings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune formation.</p>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="store-trainings">
              {trainings.slice(0, 5).map((training) => (
                <li key={training.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/animation/formations/${training.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {formatDateFr(training.trainingDate)} —{" "}
                    {TRAINING_TYPE_LABELS[training.type]}
                  </Link>
                  <Badge variant="secondary">
                    {TRAINING_STATUS_LABELS[training.status]}
                  </Badge>
                  <span className="text-muted-foreground">
                    {training.participants.length} participant
                    {training.participants.length > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans d&apos;action en cours</CardTitle>
        </CardHeader>
        <CardContent>
          {openPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun plan d&apos;action ouvert.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {openPlans.map((plan) => (
                <li key={plan.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/animation/plans-action/${plan.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {formatPlanNumber(plan.number)} — {plan.title}
                  </Link>
                  <Badge variant="secondary">
                    {ACTION_PLAN_STATUS_LABELS[plan.status]}
                  </Badge>
                  {isPlanLate(plan, today) ? (
                    <Badge variant="destructive">En retard</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
