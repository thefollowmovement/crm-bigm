"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_CATEGORY_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/lib/actions/safe-action";

import { addVersionAction, createDocumentAction } from "./actions";

export function CategoryFilter({ current }: { current?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={current ?? "all"}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams);
        if (v === "all") params.delete("categorie");
        else params.set("categorie", v);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Toutes les catégories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Toutes les catégories</SelectItem>
        {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CreateDocumentDialog({
  folders,
  defaultFolderId,
}: {
  folders: { id: string; label: string }[];
  defaultFolderId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createDocumentAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-document-button">
          <Plus /> Nouveau document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau document</DialogTitle>
          <DialogDescription>
            Le fichier envoyé devient la version 1, marquée « applicable ».
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label>Catégorie</Label>
            <Select name="category" defaultValue="PROCEDURE">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dossier</Label>
            <Select name="folderId" defaultValue={defaultFolderId ?? "none"}>
              <SelectTrigger data-testid="document-folder-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Racine de la bibliothèque</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file">Fichier</Label>
            <Input id="file" name="file" type="file" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effectiveDate">Date d&apos;applicabilité</Label>
            <Input id="effectiveDate" name="effectiveDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Visibilité (vide = tout le siège)
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ROLE_LABELS)
                .filter(
                  // SALARIE n'a pas document:read : inutile de le proposer.
                  ([value]) =>
                    value !== "ADMIN" && value !== "DIRECTION" && value !== "SALARIE"
                )
                .map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm"
                    data-testid={`visibility-${value}`}
                  >
                    <Checkbox name="visibleToRoles" value={value} />
                    {label}
                  </label>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cochez « Franchisé » pour partager le document avec les franchisés.
            </p>
          </fieldset>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Envoi…" : "Ajouter le document"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddVersionDialog({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addVersionAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-version-button">
          <Upload /> Nouvelle version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle version</DialogTitle>
          <DialogDescription>
            Cette version deviendra la version applicable ; les anciennes restent
            consultables dans l&apos;historique.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="documentId" value={documentId} />
          <div className="space-y-1.5">
            <Label htmlFor="version-file">Fichier</Label>
            <Input id="version-file" name="file" type="file" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="changeNote">Motif de la nouvelle version</Label>
            <Input
              id="changeNote"
              name="changeNote"
              placeholder="Ex. mise à jour tarifaire 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="version-effectiveDate">Date d&apos;applicabilité</Label>
            <Input id="version-effectiveDate" name="effectiveDate" type="date" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Envoi…" : "Ajouter la version"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
