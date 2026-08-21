import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import {
  ACTION_PLAN_STATUS_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_TYPE_LABELS,
} from "@/lib/labels";
import { computeAuditScore, getVisit, listCriteria } from "@/services/visits.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
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

import {
  AuditGrid,
  FinalizeVisitButton,
  ReportForm,
  VisitFilesForm,
} from "./visit-detail-components";

export const metadata: Metadata = { title: "Visite terrain" };

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "visit:read")) return <AccessDenied />;

  const { id } = await params;
  const visit = await getVisit(user, id);
  if (!visit) notFound();

  const canWrite = can(user, "visit:write");
  const isEditable =
    visit.status === "BROUILLON" &&
    canWrite &&
    (visit.visitedById === user.id ||
      user.role === "ADMIN" ||
      user.role === "DIRECTION");

  const score = computeAuditScore(
    visit.items.map((i) => ({ score: i.score, maxScore: i.criterion.maxScore }))
  );
  const criteria = isEditable && visit.type === "AUDIT" ? await listCriteria(user) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {VISIT_TYPE_LABELS[visit.type]} — {visit.store.code}{" "}
            {visit.store.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Le {formatDateFr(visit.visitDate)} par {visit.visitedBy.firstName}{" "}
            {visit.visitedBy.lastName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {visit.type === "AUDIT" && score !== null ? (
            <Badge
              variant={score >= 80 ? "success" : score >= 60 ? "warning" : "destructive"}
              data-testid="visit-score"
            >
              Note : {String(score).replace(".", ",")} %
            </Badge>
          ) : null}
          <Badge
            variant={visit.status === "FINALISEE" ? "success" : "secondary"}
            data-testid="visit-status"
          >
            {VISIT_STATUS_LABELS[visit.status]}
          </Badge>
        </div>
      </div>

      {visit.type === "AUDIT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Grille de notation</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditable ? (
              criteria.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun critère actif dans la grille — demandez à la direction
                  d&apos;en créer sur la page Visites &amp; audits.
                </p>
              ) : (
                <AuditGrid
                  visitId={visit.id}
                  criteria={criteria.map((c) => ({
                    id: c.id,
                    label: c.label,
                    category: c.category,
                    maxScore: c.maxScore,
                  }))}
                  existing={visit.items.map((i) => ({
                    criterionId: i.criterionId,
                    score: i.score,
                    isCompliant: i.isCompliant,
                    comment: i.comment,
                  }))}
                />
              )
            ) : visit.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun critère noté.</p>
            ) : (
              <Table data-testid="audit-items-readonly">
                <TableHeader>
                  <TableRow>
                    <TableHead>Critère</TableHead>
                    <TableHead className="text-right">Note</TableHead>
                    <TableHead>Conforme</TableHead>
                    <TableHead>Commentaire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visit.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.criterion.label}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.score} / {item.criterion.maxScore}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isCompliant ? "success" : "destructive"}>
                          {item.isCompliant ? "Oui" : "Non-conformité"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.comment ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Compte rendu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditable ? (
            <ReportForm visitId={visit.id} report={visit.report} />
          ) : (
            <p className="whitespace-pre-wrap text-sm" data-testid="visit-report">
              {visit.report ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pièces jointes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {visit.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
          ) : (
            <ul className="list-inside list-disc text-sm">
              {visit.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/files/${a.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {a.originalName}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {isEditable ? <VisitFilesForm visitId={visit.id} /> : null}
        </CardContent>
      </Card>

      {visit.actionPlans.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Plans d&apos;action liés</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {visit.actionPlans.map((plan) => (
                <li key={plan.id} className="flex items-center gap-2">
                  <Link
                    href={`/animation/plans-action/${plan.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    PA-{String(plan.number).padStart(6, "0")} — {plan.title}
                  </Link>
                  <Badge variant="secondary">
                    {ACTION_PLAN_STATUS_LABELS[plan.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {isEditable ? <FinalizeVisitButton visitId={visit.id} /> : null}

      <EntityHistory user={user} tableName="store_visits" recordId={visit.id} />
    </div>
  );
}
