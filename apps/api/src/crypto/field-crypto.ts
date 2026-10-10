import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts sensitive fields (PAN, Aadhaar, bank account…) with AES-256-GCM.
 *
 * Each workspace gets its own key, derived from the master key with HKDF, so a
 * leaked row or key for one company exposes nothing about another. The
 * workspace id and field name are bound in as additional authenticated data, so
 * ciphertext copied to another company or another column fails to decrypt.
 * The version prefix leaves room for rotating to a KMS-held key later.
 */
export class FieldCrypto {
  private readonly master: Buffer;
  private readonly keys = new Map<string, Buffer>();

  /** @param masterKey 32 bytes, base64 (DATA_ENCRYPTION_KEY). */
  constructor(masterKey: string) {
    this.master = Buffer.from(masterKey, 'base64');
    if (this.master.length !== 32) throw new Error('Encryption key must be 32 bytes');
  }

  encrypt(tenantId: string, field: string, plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keyFor(tenantId), iv);
    cipher.setAAD(Buffer.from(`${tenantId}:${field}`));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')}`;
  }

  decrypt(tenantId: string, field: string, stored: string): string {
    const [version, payload] = stored.split('.');
    if (version !== VERSION || !payload) throw new Error('Unknown ciphertext format');
    const raw = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.keyFor(tenantId),
      raw.subarray(0, IV_BYTES),
    );
    decipher.setAAD(Buffer.from(`${tenantId}:${field}`));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  private keyFor(tenantId: string): Buffer {
    let key = this.keys.get(tenantId);
    if (!key) {
      key = Buffer.from(hkdfSync('sha256', this.master, tenantId, 'hrms-field-encryption-v1', 32));
      this.keys.set(tenantId, key);
    }
    return key;
  }
}
