import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import { todayParis } from "@/lib/dates";
import {
  POLE_LABELS,
  ROLE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/labels";
import {
  getTicket,
  isTicketLate,
  listAssignableUsers,
} from "@/services/tickets.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AssignForm, CommentForm, TransitionButtons } from "./ticket-detail-forms";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();

  // Sans ticket:read, le service n'autorise que les tickets qui concernent
  // l'utilisateur (demandeur ou responsable) — un salarié ou un franchisé
  // assigné consulte donc SON ticket.
  const { id } = await params;
  let ticket;
  try {
    ticket = await getTicket(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!ticket) notFound();

  const members = can(user, "ticket:read") ? await listAssignableUsers(user) : [];
  const number = `T-${String(ticket.number).padStart(6, "0")}`;
  const late = isTicketLate(ticket, todayParis());
  const canWrite = can(user, "ticket:write");
  const canAudit = can(user, "audit:read");
  const isRequester = ticket.requesterId === user.id;

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="ticket-title">
          {number} — {ticket.title}
        </h1>
        <Badge data-testid="ticket-status">
          {TICKET_STATUS_LABELS[ticket.status]}
        </Badge>
        <Badge
          variant={
            ticket.priority === "CRITIQUE"
              ? "destructive"
              : ticket.priority === "HAUTE"
                ? "warning"
                : "secondary"
          }
        >
          {TICKET_PRIORITY_LABELS[ticket.priority]}
        </Badge>
        {late ? <Badge variant="destructive">En retard</Badge> : null}
      </div>

      <Tabs defaultValue="fil">
        <TabsList>
          <TabsTrigger value="fil">Fil du ticket</TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="fil" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Demande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{ticket.description}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>
                  Demandeur : {ticket.requester.firstName} {ticket.requester.lastName} (
                  {POLE_LABELS[ticket.fromPole]})
                </span>
                <span>
                  Destinataires :{" "}
                  {[ticket.toPole, ...ticket.extraPoles]
                    .map((pole) => POLE_LABELS[pole])
                    .join(", ")}
                </span>
                {ticket.store ? (
                  <span>
                    Boutique :{" "}
                    <Link
                      href={`/boutiques/${ticket.store.id}`}
                      className="text-brand hover:underline"
                    >
                      {ticket.store.code}
                    </Link>
                  </span>
                ) : null}
                {ticket.dueDate ? <span>Échéance : {ticket.dueDate}</span> : null}
                <span data-testid="ticket-assignees">
                  Responsables :{" "}
                  {ticket.assignees.length > 0
                    ? ticket.assignees
                        .map((a) => `${a.user.firstName} ${a.user.lastName}`)
                        .join(", ")
                    : "non affecté"}
                </span>
              </div>
              {ticket.attachments.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {ticket.attachments.map((file) => (
                    <li key={file.id}>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/api/files/${file.id}`}>
                          <Download /> {file.originalName}
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {canWrite ? (
            <div className="flex flex-wrap items-center gap-3">
              <TransitionButtons
                ticketId={ticket.id}
                status={ticket.status}
                isRequester={isRequester}
                role={user.role}
              />
              {ticket.status !== "VALIDE" ? (
                <AssignForm
                  ticketId={ticket.id}
                  members={members.map((m) => ({
                    id: m.id,
                    label: `${m.firstName} ${m.lastName}${
                      m.pole
                        ? ` · ${POLE_LABELS[m.pole]}`
                        : ` · ${ROLE_LABELS[m.role] ?? m.role}`
                    }`,
                  }))}
                  currentAssigneeIds={ticket.assignees.map((a) => a.userId)}
                />
              ) : null}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Commentaires ({ticket.comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
              ) : (
                <ol className="space-y-3">
                  {ticket.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {comment.author.firstName} {comment.author.lastName}
                        </span>
                        {dateFormat.format(comment.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              {canWrite && ticket.status !== "VALIDE" ? (
                <CommentForm ticketId={ticket.id} />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="tickets" recordId={ticket.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
