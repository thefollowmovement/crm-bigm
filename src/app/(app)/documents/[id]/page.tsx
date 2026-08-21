import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { DOCUMENT_CATEGORY_LABELS, ROLE_LABELS } from "@/lib/labels";
import { getDocument } from "@/services/documents.service";
import { ForbiddenError } from "@/lib/authz/guards";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { AddVersionDialog } from "../document-dialogs";
import { ArchiveButton } from "./archive-button";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "document:read")) return <AccessDenied />;

  const { id } = await params;
  let doc;
  try {
    doc = await getDocument(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  if (!doc) notFound();

  const canWrite = can(user, "document:write");
  const canAudit = can(user, "audit:read");
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="document-title">
          {doc.title}
        </h1>
        <Badge variant="secondary">{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
        {doc.isArchived ? <Badge variant="destructive">Archivé</Badge> : null}
        <div className="flex-1" />
        {canWrite ? (
          <div className="flex gap-2">
            <AddVersionDialog documentId={doc.id} />
            <ArchiveButton documentId={doc.id} isArchived={doc.isArchived} />
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          {canAudit ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="versions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {doc.notes ? <p>{doc.notes}</p> : null}
              <p className="text-muted-foreground">
                Visibilité :{" "}
                {doc.visibleToRoles.length === 0
                  ? "tout le siège"
                  : doc.visibleToRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}
              </p>
            </CardContent>
          </Card>

          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Version</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Applicable au</TableHead>
                  <TableHead>Ajoutée par</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.versions.map((version) => {
                  const isCurrent = version.id === doc.currentVersionId;
                  return (
                    <TableRow key={version.id} data-testid={`version-row-${version.versionNumber}`}>
                      <TableCell className="font-medium">
                        v{version.versionNumber}
                        {isCurrent ? (
                          <Badge className="ml-2" variant="success">
                            Applicable
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{version.file.originalName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.changeNote ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.effectiveDate
                          ? dateFormat.format(new Date(`${version.effectiveDate}T00:00:00`))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.uploadedBy.firstName} {version.uploadedBy.lastName}{" "}
                        <span className="text-xs">
                          ({dateFormat.format(version.createdAt)})
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/files/${version.file.id}`}
                            data-testid={`download-v${version.versionNumber}`}
                          >
                            <Download /> Télécharger
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {canAudit ? (
          <TabsContent value="historique">
            <EntityHistory user={user} tableName="documents" recordId={doc.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
