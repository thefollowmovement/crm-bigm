import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/vault/crypto";

const TEST_KEY = Buffer.from("test-key-32-bytes-pour-le-coffre").toString("base64");

describe("coffre-fort — crypto AES-256-GCM", () => {
  beforeEach(() => {
    process.env.VAULT_KEY = TEST_KEY;
  });
  afterEach(() => {
    delete process.env.VAULT_KEY;
  });

  it("roundtrip : chiffre puis déchiffre à l'identique, IV unique", () => {
    const secret = "S3cr3t-Très-Confidentiel-éàç €";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    // IV aléatoire : deux chiffrés différents pour le même clair.
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("altération détectée : le tag GCM fait échouer le déchiffrement", () => {
    const payload = encryptSecret("motdepasse");
    const [v, iv, tag, cipher] = payload.split(":");
    const tampered = Buffer.from(cipher, "base64");
    tampered[0] = tampered[0] ^ 0xff;
    expect(() =>
      decryptSecret([v, iv, tag, tampered.toString("base64")].join(":"))
    ).toThrow(/altérées|incorrecte/);
  });

  it("mauvaise clé → échec explicite ; format inconnu → échec", () => {
    const payload = encryptSecret("motdepasse");
    process.env.VAULT_KEY = Buffer.from(
      "autre-cle-32-bytes-pour-le-test!"
    ).toString("base64");
    expect(() => decryptSecret(payload)).toThrow(/incorrecte|altérées/);

    expect(() => decryptSecret("v2:abc:def:ghi")).toThrow(/format/);
    expect(() => decryptSecret("n'importe quoi")).toThrow(/format/);
  });

  it("clé absente ou invalide → erreur à l'usage, jamais de fallback", () => {
    delete process.env.VAULT_KEY;
    expect(() => encryptSecret("x")).toThrow(/VAULT_KEY absent/);
    process.env.VAULT_KEY = "trop-court";
    expect(() => encryptSecret("x")).toThrow(/32 octets/);
  });
});
