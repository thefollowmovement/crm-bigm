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
import { listVisitClaims, canDecideClaim } from "@/services/expense-claims.service";
import { isProbablyHtml, sanitizeHtml } from "@/lib/html/sanitize";
import { formatEUR } from "@/lib/money";
import { EXPENSE_CLAIM_STATUS_LABELS } from "@/lib/labels";
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
  DecideClaimButtons,
  ExpenseClaimForm,
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
  const claims = await listVisitClaims(user, visit.id);
  const canDecide = canWrite && canDecideClaim(user.role);
  // Compte rendu riche (étape 54) : sanitisé aussi à la lecture.
  const reportHtml = visit.report
    ? isProbablyHtml(visit.report)
      ? sanitizeHtml(visit.report)
      : null
    : null;
  const editorImages = visit.attachments
    .filter((a) => a.mimeType.startsWith("image/"))
    .map((a) => ({ id: a.id, label: a.title ?? a.originalName }));

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
            <ReportForm
              visitId={visit.id}
              reportHtml={
                reportHtml ??
                (visit.report
                  ? `<p>${visit.report.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`
                  : "")
              }
              images={editorImages}
            />
          ) : reportHtml ? (
            <div
              className="space-y-2 text-sm [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-inside [&_ul]:list-disc [&_ol]:list-inside [&_ol]:list-decimal [&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-lg"
              data-testid="visit-report"
              // HTML reconstruit par sanitizeHtml (liste blanche stricte).
              dangerouslySetInnerHTML={{ __html: reportHtml }}
            />
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
            <ul className="list-inside list-disc text-sm" data-testid="visit-attachments">
              {visit.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/files/${a.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {a.title ?? a.originalName}
                  </a>
                  {a.title ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({a.originalName})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {isEditable ? <VisitFilesForm visitId={visit.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes de frais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune note de frais sur cette visite.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="visit-claims">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
                >
                  <span className="font-medium">{claim.title}</span>
                  <span className="tabular-nums">{formatEUR(claim.amountTTC)}</span>
                  <Badge
                    variant={
                      claim.status === "VALIDEE"
                        ? "info"
                        : claim.status === "REMBOURSEE"
                          ? "success"
                          : claim.status === "REFUSEE"
                            ? "destructive"
                            : "secondary"
                    }
                  >
                    {EXPENSE_CLAIM_STATUS_LABELS[claim.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    par {claim.createdBy.firstName} {claim.createdBy.lastName}
                  </span>
                  {claim.attachments.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      {file.title ?? file.originalName}
                    </a>
                  ))}
                  {claim.note ? (
                    <span className="w-full text-xs text-muted-foreground">
                      {claim.note}
                    </span>
                  ) : null}
                  {canDecide && claim.status === "DEMANDE" ? (
                    <span className="ml-auto">
                      <DecideClaimButtons claimId={claim.id} visitId={visit.id} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWrite ? <ExpenseClaimForm visitId={visit.id} /> : null}
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
