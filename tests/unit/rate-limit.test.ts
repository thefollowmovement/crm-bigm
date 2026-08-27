import { beforeEach, describe, expect, it } from "vitest";

import {
  clientIpFromHeaders,
  rateLimit,
  resetRateLimits,
} from "@/lib/rate-limit";

describe("limitation de débit (fenêtre glissante)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("autorise jusqu'à la limite puis refuse dans la fenêtre", () => {
    const rule = { limit: 3, windowMs: 60_000 };
    const t0 = 1_000_000;
    expect(rateLimit("ip:1", rule, t0)).toBe(true);
    expect(rateLimit("ip:1", rule, t0 + 1)).toBe(true);
    expect(rateLimit("ip:1", rule, t0 + 2)).toBe(true);
    expect(rateLimit("ip:1", rule, t0 + 3)).toBe(false);
    // Une autre clé n'est pas affectée.
    expect(rateLimit("ip:2", rule, t0 + 3)).toBe(true);
  });

  it("la fenêtre glisse : les anciennes requêtes expirent", () => {
    const rule = { limit: 2, windowMs: 1_000 };
    const t0 = 5_000;
    expect(rateLimit("k", rule, t0)).toBe(true);
    expect(rateLimit("k", rule, t0 + 100)).toBe(true);
    expect(rateLimit("k", rule, t0 + 200)).toBe(false);
    // Après la fenêtre, ça repasse.
    expect(rateLimit("k", rule, t0 + 1_101)).toBe(true);
  });

  it("extrait la première IP de X-Forwarded-For", () => {
    expect(
      clientIpFromHeaders(
        new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })
      )
    ).toBe("203.0.113.7");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2"
    );
    expect(clientIpFromHeaders(new Headers())).toBe("inconnue");
  });
});
