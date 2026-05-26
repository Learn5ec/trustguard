export class LLMKeyManager {
  private static PREFIX = 'trustguard_key_';

  static save(providerId: string, key: string): void {
    sessionStorage.setItem(this.PREFIX + providerId, key);
  }

  static get(providerId: string): string | null {
    return sessionStorage.getItem(this.PREFIX + providerId);
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
