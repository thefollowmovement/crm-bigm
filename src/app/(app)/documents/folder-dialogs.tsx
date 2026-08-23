"use client";

import { useActionState, useEffect, useState } from "react";
import { FolderPlus, FolderPen, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { ActionState } from "@/lib/actions/safe-action";

import {
  createFolderAction,
  deleteFolderAction,
  moveDocumentAction,
  renameFolderAction,
} from "./actions";

function useToasted(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

// Création d'un sous-dossier de l'emplacement courant (racine si parentId null).
export function CreateFolderDialog({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createFolderAction,
    {}
  );
  useToasted(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="new-folder-button">
          <FolderPlus /> Nouveau dossier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau dossier</DialogTitle>
          <DialogDescription>
            Le dossier sera créé dans l&apos;emplacement affiché.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Nom du dossier</Label>
            <Input
              id="folder-name"
              name="name"
              required
              placeholder="Ex. Juridique 2026"
              data-testid="folder-name-input"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending} data-testid="folder-submit">
            {pending ? "Création…" : "Créer le dossier"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Renommage + suppression (à vide uniquement) du dossier courant.
export function FolderActions({
  folder,
}: {
  folder: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState<
    ActionState,
    FormData
  >(renameFolderAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    ActionState,
    FormData
  >(deleteFolderAction, {});
  useToasted(renameState, () => setOpen(false));
  useToasted(deleteState);

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Renommer le dossier"
            data-testid="folder-rename-button"
          >
            <FolderPen />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer « {folder.name} »</DialogTitle>
          </DialogHeader>
          <form action={renameAction} className="space-y-4">
            <input type="hidden" name="folderId" value={folder.id} />
            <div className="space-y-1.5">
              <Label htmlFor="folder-rename">Nouveau nom</Label>
              <Input
                id="folder-rename"
                name="name"
                required
                defaultValue={folder.name}
                data-testid="folder-rename-input"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={renamePending}
              data-testid="folder-rename-submit"
            >
              {renamePending ? "Renommage…" : "Renommer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <form action={deleteAction}>
        <input type="hidden" name="folderId" value={folder.id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          title="Supprimer le dossier (uniquement s'il est vide)"
          disabled={deletePending}
          data-testid="folder-delete-button"
        >
          <Trash2 />
        </Button>
      </form>
    </div>
  );
}

// Déplacement d'un document vers un dossier (fiche document).
export function MoveDocumentSelect({
  documentId,
  currentFolderId,
  folders,
}: {
  documentId: string;
  currentFolderId: string | null;
  folders: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    moveDocumentAction,
    {}
  );
  useToasted(state);
  const [selected, setSelected] = useState(currentFolderId ?? "none");

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <div className="space-y-1.5">
        <Label>Dossier</Label>
        <Select name="folderId" value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-64" data-testid="move-select">
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
      <Button
        type="submit"
        variant="outline"
        disabled={pending || selected === (currentFolderId ?? "none")}
        data-testid="move-submit"
      >
        Déplacer
      </Button>
    </form>
  );
}
