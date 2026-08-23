"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  changeEmailAction,
  changePasswordAction,
  updateProfileAction,
  type ActionState,
} from "./actions";

function useActionToast(state: ActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);
}

export function ProfileForm({
  profile,
}: {
  profile: { firstName: string; lastName: string; phone: string | null };
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, {});
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4" data-testid="profile-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="account-first-name">Prénom</Label>
          <Input
            id="account-first-name"
            name="firstName"
            required
            defaultValue={profile.firstName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-last-name">Nom</Label>
          <Input
            id="account-last-name"
            name="lastName"
            required
            defaultValue={profile.lastName}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-phone">Téléphone</Label>
        <Input
          id="account-phone"
          name="phone"
          type="tel"
          placeholder="06 12 34 56 78"
          defaultValue={profile.phone ?? ""}
          data-testid="account-phone"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="profile-submit">
        {pending ? "Enregistrement…" : "Enregistrer mes coordonnées"}
      </Button>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, {});
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4" data-testid="email-form">
      <div className="space-y-1.5">
        <Label htmlFor="account-email">Nouvelle adresse e-mail</Label>
        <Input
          id="account-email"
          name="email"
          type="email"
          required
          defaultValue={email}
          data-testid="account-email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email-current-password">Mot de passe actuel</Label>
        <Input
          id="email-current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          data-testid="email-current-password"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="email-submit">
        {pending ? "Enregistrement…" : "Changer mon adresse e-mail"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, {});
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4" data-testid="password-form">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Mot de passe actuel</Label>
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          data-testid="current-password"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nouveau mot de passe</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            data-testid="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirmation</Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            data-testid="confirm-password"
          />
        </div>
      </div>
      <Button type="submit" disabled={pending} data-testid="password-submit">
        {pending ? "Enregistrement…" : "Changer mon mot de passe"}
      </Button>
    </form>
  );
}
