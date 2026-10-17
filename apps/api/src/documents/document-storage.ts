import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Env } from '../config';
import { FieldCrypto } from '../crypto/field-crypto';

/**
 * Where document bytes live. Files are encrypted with the workspace key before they touch
 * disk, under `<STORAGE_DIR>/<tenantId>/<documentId>`. This local-disk store is enough for one
 * server; production swaps it for object storage (S3-compatible) behind the same three methods.
 */
@Injectable()
export class DocumentStorage {
  private readonly root: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly crypto: FieldCrypto,
  ) {
    this.root = resolve(String(config.get('STORAGE_DIR', { infer: true })));
  }

  key(tenantId: string, documentId: string) {
    return `${tenantId}/${documentId}`;
  }

  async put(tenantId: string, documentId: string, data: Buffer) {
    const key = this.key(tenantId, documentId);
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, this.crypto.encryptBytes(tenantId, documentId, data), { mode: 0o600 });
    return key;
  }

  async get(tenantId: string, documentId: string, key: string) {
    return this.crypto.decryptBytes(tenantId, documentId, await readFile(this.path(key)));
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }

  /** Resolves a key inside the storage root, refusing anything that would escape it. */
  private path(key: string) {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return path;
  }
}
