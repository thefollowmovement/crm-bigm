"use client";

// Wrappers maison autour de recharts — SEUL fichier autorisé à importer la
// librairie et SEULE frontière où un montant string est converti en nombre
// (affichage uniquement, jamais pour comparer ou additionner).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { toCents } from "@/lib/money";

const BRAND = "var(--color-brand)";
const MUTED = "oklch(0.65 0.02 260)";
const GRID = "var(--color-border)";

const EUR_AXIS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const EUR_FULL = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

// Conversion d'affichage : montant string numeric → euros en nombre.
function toEuros(amount: string): number {
  try {
    return toCents(amount) / 100;
  } catch {
    return 0;
  }
}

function formatAxis(value: number): string {
  return EUR_AXIS.format(value);
}

function formatTooltip(value: number | string): string {
  return EUR_FULL.format(typeof value === "number" ? value : 0);
}

const AXIS_STYLE = { fontSize: 12 } as const;

export type TimeSeriesPoint = { label: string; gross: string };

// Courbe d'évolution d'un montant dans le temps (CA par jour/semaine/mois).
export function TimeSeriesChart({
  data,
  seriesLabel,
  height = 320,
  testId,
}: {
  data: TimeSeriesPoint[];
  seriesLabel: string;
  height?: number;
  testId?: string;
}) {
  const points = data.map((d) => ({ label: d.label, value: toEuros(d.gross) }));
  return (
    <div data-testid={testId} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickMargin={8} minTickGap={24} />
          <YAxis tick={AXIS_STYLE} tickFormatter={formatAxis} width={90} />
          <Tooltip formatter={(value) => [formatTooltip(value as number), seriesLabel]} />
          <Line
            type="monotone"
            dataKey="value"
            name={seriesLabel}
            stroke={BRAND}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type ComparisonPoint = { label: string; current: string; previous: string };

// Barres groupées N vs N-1 (une paire par mois).
export function ComparisonBarChart({
  data,
  currentLabel,
  previousLabel,
  height = 320,
  testId,
}: {
  data: ComparisonPoint[];
  currentLabel: string;
  previousLabel: string;
  height?: number;
  testId?: string;
}) {
  const points = data.map((d) => ({
    label: d.label,
    current: toEuros(d.current),
    previous: toEuros(d.previous),
  }));
  return (
    <div data-testid={testId} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickMargin={8} />
          <YAxis tick={AXIS_STYLE} tickFormatter={formatAxis} width={90} />
          <Tooltip
            formatter={(value, name) => [
              formatTooltip(value as number),
              name === "current" ? currentLabel : previousLabel,
            ]}
          />
          <Legend
            formatter={(value) => (value === "current" ? currentLabel : previousLabel)}
          />
          <Bar dataKey="previous" fill={MUTED} radius={[3, 3, 0, 0]} />
          <Bar dataKey="current" fill={BRAND} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
