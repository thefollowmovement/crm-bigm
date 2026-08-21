import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { DOCUMENT_CATEGORY_LABELS, ROLE_LABELS } from "@/lib/labels";
import { listDocuments } from "@/services/documents.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CategoryFilter, CreateDocumentDialog } from "./document-dialogs";

export const metadata: Metadata = { title: "Documents" };

const CATEGORY_VALUES = [
  "JURIDIQUE",
  "PROCEDURE",
  "RH",
  "COMPTABILITE",
  "COMMUNICATION",
  "FORMATION",
  "MARKETING",
  "AUTRE",
] as const;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "document:read")) return <AccessDenied />;

  const params = await searchParams;
  const category = CATEGORY_VALUES.find((c) => c === params.categorie);

  const docs = await listDocuments(user, { category });
  const canWrite = can(user, "document:write");

  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bibliothèque documentaire</h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} document{docs.length > 1 ? "s" : ""} — la version
            « applicable » est toujours la plus récente.
          </p>
        </div>
        {canWrite ? <CreateDocumentDialog /> : null}
      </div>

      <CategoryFilter current={category} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titre</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Version applicable</TableHead>
              <TableHead>Visibilité</TableHead>
              <TableHead>Mise à jour</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun document.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => (
                <TableRow key={doc.id} data-testid={`doc-row-${doc.title}`}>
                  <TableCell>
                    <Link
                      href={`/documents/${doc.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {DOCUMENT_CATEGORY_LABELS[doc.category]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.currentVersion
                      ? `v${doc.currentVersion.versionNumber} — ${doc.currentVersion.file.originalName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {doc.visibleToRoles.length === 0
                      ? "Tout le siège"
                      : doc.visibleToRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormat.format(doc.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
