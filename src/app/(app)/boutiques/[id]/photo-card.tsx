"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions/safe-action";

import { removeStorePhotoAction, setStorePhotoAction } from "../actions";

function useToastState(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

// Photo de la fiche boutique : affichage + remplacement + suppression.
// Le fichier est servi par /api/files/[id] (session + périmètre boutique).
export function StorePhotoCard({
  storeId,
  photoFileId,
  storeName,
  canWrite,
}: {
  storeId: string;
  photoFileId: string | null;
  storeName: string;
  canWrite: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [setState, setFormAction, setPending] = useActionState<ActionState, FormData>(
    setStorePhotoAction,
    {}
  );
  const [removeState, removeFormAction, removePending] = useActionState<
    ActionState,
    FormData
  >(removeStorePhotoAction, {});
  useToastState(setState);
  useToastState(removeState);

  return (
    <div className="space-y-4">
      {photoFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${photoFileId}`}
          alt={`Photo de ${storeName}`}
          className="h-48 w-full rounded-lg border object-cover"
          data-testid="store-photo"
        />
      ) : (
        <div
          className="flex h-48 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
          data-testid="store-photo-empty"
        >
          Aucune photo
        </div>
      )}

      {canWrite ? (
        <div className="space-y-3">
          <form ref={formRef} action={setFormAction} className="space-y-2">
            <input type="hidden" name="storeId" value={storeId} />
            <Label htmlFor="store-photo-input">
              {photoFileId ? "Remplacer la photo" : "Ajouter une photo"} (JPG, PNG, WebP)
            </Label>
            <div className="flex gap-2">
              <Input
                id="store-photo-input"
                name="photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                data-testid="store-photo-input"
              />
              <Button type="submit" disabled={setPending} data-testid="store-photo-submit">
                {setPending ? "Envoi…" : "Enregistrer"}
              </Button>
            </div>
          </form>
          {photoFileId ? (
            <form action={removeFormAction}>
              <input type="hidden" name="storeId" value={storeId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={removePending}
                data-testid="store-photo-remove"
              >
                Supprimer la photo
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
