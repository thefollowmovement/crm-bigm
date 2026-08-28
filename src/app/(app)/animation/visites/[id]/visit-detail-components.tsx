"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ActionState } from "@/lib/actions/safe-action";

import {
  addVisitFilesAction,
  createExpenseClaimAction,
  decideExpenseClaimAction,
  finalizeVisitAction,
  saveAuditItemsAction,
  updateReportAction,
} from "../actions";

function useToasted(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

// Compte rendu RICHE (étape 54) : gras, titres, listes, images — le HTML
// passé au serveur est sanitisé par l'action (liste blanche stricte).
export function ReportForm({
  visitId,
  reportHtml,
  images,
}: {
  visitId: string;
  // HTML déjà sanitisé côté serveur (ou "" pour un nouveau compte rendu).
  reportHtml: string;
  images: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateReportAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="visitId" value={visitId} />
      <div className="space-y-1.5">
        <Label>Compte rendu</Label>
        <RichTextEditor
          name="report"
          initialHtml={reportHtml}
          images={images}
          testId="visit-report-input"
        />
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Pour illustrer le compte rendu, ajoutez d&apos;abord vos photos en
            pièces jointes : elles deviendront insérables ici.
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="visit-report-submit"
      >
        {pending ? "Enregistrement…" : "Enregistrer le compte rendu"}
      </Button>
    </form>
  );
}

type CriterionRow = {
  id: string;
  label: string;
  category: string | null;
  maxScore: number;
};

type ExistingItem = {
  criterionId: string;
  score: number;
  isCompliant: boolean;
  comment: string | null;
};

// Grille de notation : état local, envoi en une seule action (JSON).
export function AuditGrid({
  visitId,
  criteria,
  existing,
}: {
  visitId: string;
  criteria: CriterionRow[];
  existing: ExistingItem[];
}) {
  const initial = useMemo(() => {
    const byId = new Map(existing.map((i) => [i.criterionId, i]));
    return criteria.map((c) => {
      const item = byId.get(c.id);
      return {
        criterionId: c.id,
        score: item ? String(item.score) : "",
        isCompliant: item ? item.isCompliant : true,
        comment: item?.comment ?? "",
      };
    });
  }, [criteria, existing]);

  const [rows, setRows] = useState(initial);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAuditItemsAction,
    {}
  );
  useToasted(state);

  function updateRow(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const payload = rows
    .filter((r) => r.score !== "")
    .map((r) => ({
      criterionId: r.criterionId,
      score: Number(r.score),
      isCompliant: r.isCompliant,
      comment: r.comment.trim() === "" ? null : r.comment.trim(),
    }));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <Table data-testid="audit-grid">
        <TableHeader>
          <TableRow>
            <TableHead>Critère</TableHead>
            <TableHead className="w-32 text-right">Note</TableHead>
            <TableHead className="w-28 text-center">Conforme</TableHead>
            <TableHead>Commentaire</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {criteria.map((c, index) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">{c.label}</div>
                {c.category ? (
                  <div className="text-xs text-muted-foreground">{c.category}</div>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    className="w-16 text-right"
                    inputMode="numeric"
                    value={rows[index].score}
                    onChange={(e) => updateRow(index, { score: e.target.value })}
                    data-testid={`score-${index}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    / {c.maxScore}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Checkbox
                  checked={rows[index].isCompliant}
                  onCheckedChange={(v) =>
                    updateRow(index, { isCompliant: v === true })
                  }
                  aria-label="Conforme"
                  data-testid={`compliant-${index}`}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={rows[index].comment}
                  onChange={(e) => updateRow(index, { comment: e.target.value })}
                  placeholder="Observation…"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        type="submit"
        disabled={pending || payload.length === 0}
        data-testid="audit-grid-submit"
      >
        {pending ? "Enregistrement…" : "Enregistrer la grille"}
      </Button>
    </form>
  );
}

export function VisitFilesForm({ visitId }: { visitId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addVisitFilesAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="visitId" value={visitId} />
      <div className="space-y-1.5">
        <Label htmlFor="visit-files">Photos / documents</Label>
        <Input id="visit-files" name="files" type="file" multiple className="w-80" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visit-files-title">Titre (facultatif)</Label>
        <Input
          id="visit-files-title"
          name="title"
          placeholder="Vitrine avant travaux"
          className="w-56"
          data-testid="visit-files-title"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Envoi…" : "Ajouter"}
      </Button>
    </form>
  );
}

// ── Notes de frais de la visite (étape 54) ───────────────────────

export function ExpenseClaimForm({ visitId }: { visitId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createExpenseClaimAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3">
      <input type="hidden" name="visitId" value={visitId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="claim-title">Titre *</Label>
          <Input
            id="claim-title"
            name="title"
            required
            placeholder="VHR — déplacement Lyon"
            data-testid="claim-title"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="claim-amount">Prix TTC (€) *</Label>
          <Input
            id="claim-amount"
            name="amountTTC"
            inputMode="decimal"
            required
            placeholder="45,90"
            data-testid="claim-amount"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="claim-note">Note</Label>
        <Textarea
          id="claim-note"
          name="note"
          rows={2}
          placeholder="Contexte de la dépense…"
          data-testid="claim-note"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="claim-files">
          Justificatifs (ticket de caisse, facture…)
        </Label>
        <Input
          id="claim-files"
          name="files"
          type="file"
          multiple
          data-testid="claim-files"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="claim-submit">
        {pending ? "Enregistrement…" : "Ajouter la note de frais"}
      </Button>
    </form>
  );
}

export function DecideClaimButtons({
  claimId,
  visitId,
}: {
  claimId: string;
  visitId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    decideExpenseClaimAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="visitId" value={visitId} />
      <Button
        type="submit"
        name="approve"
        value="true"
        size="sm"
        disabled={pending}
        data-testid={`claim-approve-${claimId}`}
      >
        Valider
      </Button>
      <Button
        type="submit"
        name="approve"
        value="false"
        size="sm"
        variant="outline"
        disabled={pending}
      >
        Refuser
      </Button>
    </form>
  );
}

export function FinalizeVisitButton({ visitId }: { visitId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    finalizeVisitAction,
    {}
  );
  useToasted(state);
  return (
    <form action={formAction}>
      <input type="hidden" name="visitId" value={visitId} />
      <Button type="submit" disabled={pending} data-testid="finalize-visit">
        {pending ? "Finalisation…" : "Finaliser la visite"}
      </Button>
    </form>
  );
}
