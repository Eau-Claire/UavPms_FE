/**
 * Idempotency keys for create requests (assessment, mission).
 *
 * The backend replays the original result when the same key arrives with the same payload, and rejects a
 * reused key with a different payload (`409 IDEMPOTENCY_KEY_REUSED`). So the key stays the same while the
 * user retries an unchanged form, and a new key is issued as soon as the payload changes.
 */
export class IdempotencyKeyTracker {
  private key: string;
  private fingerprint: string | null = null;

  constructor(private readonly generate: () => string = newKey) {
    this.key = generate();
  }

  /** Key to send for this payload: the previous key when the payload is unchanged, a fresh one otherwise. */
  keyFor(payload: unknown): string {
    const next = stableStringify(payload);
    if (this.fingerprint !== null && this.fingerprint !== next) this.key = this.generate();
    this.fingerprint = next;
    return this.key;
  }

  /** Forget the last payload and issue a new key (e.g. when another record is selected). */
  reset(): void {
    this.key = this.generate();
    this.fingerprint = null;
  }
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** JSON with object keys sorted, so two equal payloads always give the same fingerprint. */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
