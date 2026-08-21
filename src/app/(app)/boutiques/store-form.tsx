"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { STORE_STATUS_LABELS, STORE_TYPE_LABELS } from "@/lib/labels";
import type { StoreDTO } from "@/lib/authz/field-visibility";
import type { ActionState } from "@/lib/actions/safe-action";

import { createStoreAction, updateStoreAction } from "./actions";

type Option = { id: string; label: string };

export function StoreForm({
  store,
  franchisees,
  animateurs,
  canSeeInternalNotes,
}: {
  // undefined = création
  store?: StoreDTO;
  franchisees: Option[];
  animateurs: Option[];
  canSeeInternalNotes: boolean;
}) {
  const router = useRouter();
  const action = store ? updateStoreAction : createStoreAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );
  const [type, setType] = useState(store?.type ?? "FRANCHISE");

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      if (!store) router.push("/boutiques");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {store ? <input type="hidden" name="storeId" value={store.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code boutique</Label>
          <Input
            id="code"
            name="code"
            required
            placeholder="BM-001"
            defaultValue={store?.code}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Nom</Label>
          <Input id="name" name="name" required defaultValue={store?.name} />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select name="type" value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger data-testid="store-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STORE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select name="status" defaultValue={store?.status ?? "EN_PROJET"}>
            <SelectTrigger data-testid="store-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STORE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === "FRANCHISE" ? (
          <div className="space-y-1.5">
            <Label>Franchisé</Label>
            <Select name="franchiseeId" defaultValue={store?.franchiseeId ?? "none"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {franchisees.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <input type="hidden" name="franchiseeId" value="none" />
        )}
        <div className="space-y-1.5">
          <Label>Animateur responsable</Label>
          <Select name="animateurId" defaultValue={store?.animateurId ?? "none"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {animateurs.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" name="address" defaultValue={store?.address ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postalCode">Code postal</Label>
          <Input id="postalCode" name="postalCode" defaultValue={store?.postalCode ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" name="city" defaultValue={store?.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="region">Région</Label>
          <Input id="region" name="region" defaultValue={store?.region ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="siret">SIRET</Label>
          <Input id="siret" name="siret" defaultValue={store?.siret ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" defaultValue={store?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" defaultValue={store?.email ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="openingDate">Date d&apos;ouverture</Label>
          <Input
            id="openingDate"
            name="openingDate"
            type="date"
            defaultValue={store?.openingDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="closingDate">Date de fermeture</Label>
          <Input
            id="closingDate"
            name="closingDate"
            type="date"
            defaultValue={store?.closingDate ?? ""}
          />
        </div>
      </div>

      {canSeeInternalNotes ? (
        <div className="space-y-1.5">
          <Label htmlFor="internalNotes">Notes internes (siège uniquement)</Label>
          <Textarea
            id="internalNotes"
            name="internalNotes"
            rows={3}
            defaultValue={store?.internalNotes ?? ""}
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-testid="store-form-submit">
          {pending ? "Enregistrement…" : store ? "Enregistrer" : "Créer la boutique"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
