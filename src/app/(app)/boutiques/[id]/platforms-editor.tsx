"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionState } from "@/lib/actions/safe-action";

import { setPlatformsAction } from "../actions";

type PlatformValue = "UBER_EATS" | "DELIVEROO" | "JUST_EAT" | "AUTRE";

type Row = {
  platform: PlatformValue;
  label: string | null;
  accountRef: string | null;
  isActive: boolean;
};

const ALL_PLATFORMS: PlatformValue[] = ["UBER_EATS", "DELIVEROO", "JUST_EAT", "AUTRE"];

export function PlatformsEditor({
  storeId,
  platforms,
  labels,
  readOnly,
}: {
  storeId: string;
  platforms: Row[];
  labels: Record<string, string>;
  readOnly: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    ALL_PLATFORMS.map(
      (p) =>
        platforms.find((row) => row.platform === p) ?? {
          platform: p,
          label: null,
          accountRef: null,
          isActive: false,
        }
    )
  );
  const [enabled, setEnabled] = useState<Set<PlatformValue>>(
    () => new Set(platforms.map((p) => p.platform))
  );
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setPlatformsAction,
    {}
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state]);

  function updateRow(platform: PlatformValue, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.platform === platform ? { ...r, ...patch } : r))
    );
  }

  const payload = rows.filter((r) => enabled.has(r.platform));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="platforms" value={JSON.stringify(payload)} />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Utilisée</TableHead>
              <TableHead>Plateforme</TableHead>
              <TableHead>Référence compte</TableHead>
              <TableHead className="w-24">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isEnabled = enabled.has(row.platform);
              return (
                <TableRow key={row.platform}>
                  <TableCell>
                    <Checkbox
                      checked={isEnabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) => {
                        setEnabled((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(row.platform);
                          else next.delete(row.platform);
                          return next;
                        });
                      }}
                      aria-label={`Utiliser ${labels[row.platform]}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {labels[row.platform]}
                    {row.platform === "AUTRE" && isEnabled ? (
                      <Input
                        className="mt-1 h-8"
                        placeholder="Nom de la plateforme"
                        value={row.label ?? ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateRow(row.platform, { label: e.target.value || null })
                        }
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      placeholder="Identifiant restaurant"
                      value={row.accountRef ?? ""}
                      disabled={readOnly || !isEnabled}
                      onChange={(e) =>
                        updateRow(row.platform, { accountRef: e.target.value || null })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.isActive}
                      disabled={readOnly || !isEnabled}
                      onCheckedChange={(checked) =>
                        updateRow(row.platform, { isActive: checked === true })
                      }
                      aria-label="Plateforme active"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {readOnly ? null : (
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les plateformes"}
        </Button>
      )}
    </form>
  );
}
