import { createReadStream, promises as fs } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

/** Dev driver: files under a local directory (git-ignored `storage/`). */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep))
      throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.path(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async get(key: string) {
    const full = this.path(key);
    await fs.access(full);
    return createReadStream(full);
  }

  async delete(key: string) {
    await fs.rm(this.path(key), { force: true });
  }
}

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Deployed driver: any S3-compatible bucket (Cloudflare R2, Supabase Storage). */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly opts: S3Options) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: !!opts.endpoint,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType?: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }),
    );
    return out.Body as Readable;
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }),
    );
  }
}

/**
 * The only way business code touches files. Keys must be `{organizationId}/...`
 * so one tenant can never address another tenant's file.
 */
export class StorageService {
  constructor(private readonly driver: StorageDriver) {}

  private check(organizationId: string, key: string) {
    if (
      !organizationId ||
      !key.startsWith(`${organizationId}/`) ||
      key.split('/').includes('..')
    ) {
      throw new Error('Storage key must start with the caller organizationId');
    }
  }

  async put(
    organizationId: string,
    key: string,
    body: Buffer,
    contentType?: string,
  ) {
    this.check(organizationId, key);
    return this.driver.put(key, body, contentType);
  }

  async getStream(organizationId: string, key: string) {
    this.check(organizationId, key);
    return this.driver.get(key);
  }

  async delete(organizationId: string, key: string) {
    this.check(organizationId, key);
    return this.driver.delete(key);
  }
}
