/**
 * LLMKeyManager — stores LLM API keys in sessionStorage with a lightweight
 * XOR obfuscation layer using a per-session ephemeral key.
 *
 * ⚠️  Security note: This is a client-side-only mitigation. It prevents casual
 * inspection in DevTools and stops automated scrapers that read plain sessionStorage,
 * but does NOT protect against a determined attacker with full JS access.
 * The correct long-term fix is a backend proxy that holds secrets server-side.
 */

// Generate a one-time random session key (lives in the JS closure, never in storage)
const SESSION_KEY = (() => {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
})();

function xorEncrypt(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ SESSION_KEY[i % SESSION_KEY.length];
  }
  return btoa(String.fromCharCode(...out));
}

function xorDecrypt(encoded: string): string {
  try {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ SESSION_KEY[i % SESSION_KEY.length];
    }
    return new TextDecoder().decode(out);
  } catch {
    return '';
  }
}

export class LLMKeyManager {
  private static PREFIX = 'trustguard_key_';

  static save(providerId: string, key: string): void {
    sessionStorage.setItem(this.PREFIX + providerId, xorEncrypt(key));
  }

  static get(providerId: string): string | null {
    const raw = sessionStorage.getItem(this.PREFIX + providerId);
    if (!raw) return null;
    const decrypted = xorDecrypt(raw);
    return decrypted || null;
  }

  static clear(providerId: string): void {
    sessionStorage.removeItem(this.PREFIX + providerId);
  }

  static clearAll(): void {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(this.PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  }
}

