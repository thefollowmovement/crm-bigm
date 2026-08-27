// Limitation de débit en mémoire (fenêtre glissante) pour les points d'accès
// PUBLICS (formulaire de transmission externe, étape 49 — cdc §2.2).
// Suffisant pour un déploiement mono-nœud (le VPS de prod) : l'état est
// perdu au redémarrage, ce qui est acceptable pour de l'anti-abus.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export type RateLimitRule = { limit: number; windowMs: number };

// true = requête autorisée (et comptée) ; false = trop de requêtes.
export function rateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): boolean {
  const cutoff = now - rule.windowMs;
  const entries = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (entries.length >= rule.limit) {
    buckets.set(key, entries);
    return false;
  }
  entries.push(now);
  buckets.set(key, entries);
  // Garde-fou mémoire : purge les clés les plus anciennes si nécessaire.
  if (buckets.size > MAX_KEYS) {
    for (const k of buckets.keys()) {
      if (buckets.size <= MAX_KEYS / 2) break;
      buckets.delete(k);
    }
  }
  return true;
}

// Réservé aux tests : repartir d'un état vide.
export function resetRateLimits() {
  buckets.clear();
}

// Première IP de X-Forwarded-For (posée par Caddy en prod), sinon inconnue.
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "inconnue";
}
