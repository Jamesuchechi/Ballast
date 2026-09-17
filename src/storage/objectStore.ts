import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export function getStorageRoot(): string {
  if (process.env.VERCEL) {
    return path.resolve('/tmp', '.storage');
  }
  return path.resolve(process.cwd(), '.storage');
}

/**
 * Resolves the 32-byte (256-bit) AES-256-GCM encryption key.
 * Strictly prohibits hardcoded fallback keys in production (Security S1).
 */
export function getEncryptionKey(): Buffer {
  const seed = process.env.BALLAST_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!seed) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY FATAL] BALLAST_ENCRYPTION_KEY (or SESSION_SECRET) must be set in production mode. Hardcoded fallback keys are strictly prohibited.'
      );
    }
    return crypto.createHash('sha256').update('ballast_default_aes_256_gcm_master_key_seed_2026').digest();
  }
  return crypto.createHash('sha256').update(seed).digest();
}

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_MAGIC = Buffer.from('BALLAST_ENC_V1:', 'utf8'); // 15 bytes magic header

export interface ObjectMetadata {
  contentType?: string;
  size: number;
  updatedAt: Date;
}

/**
 * Storage driver abstraction: allows local disk storage or cloud object storage (Cloudflare R2 / AWS S3)
 */
interface StorageDriver {
  readonly name: string;
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  has(key: string): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  removePrefix(prefix: string): Promise<number>;
  getLocalPath?(key: string): string;
}

/**
 * Local filesystem driver with lazy directory initialization and Vercel /tmp resolution.
 */
export class FsDriver implements StorageDriver {
  readonly name = 'filesystem';
  private root: string;

  constructor(rootPath?: string) {
    this.root = rootPath || getStorageRoot();
  }

  private ensureStorageRoot(): void {
    if (!fs.existsSync(this.root)) {
      try {
        fs.mkdirSync(this.root, { recursive: true });
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
  }

  private resolveKey(key: string): string {
    const safeKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.root, safeKey);
  }

  async write(key: string, data: Buffer): Promise<void> {
    this.ensureStorageRoot();
    const fullPath = this.resolveKey(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    await fs.promises.writeFile(fullPath, data);
  }

  async read(key: string): Promise<Buffer | null> {
    const fullPath = this.resolveKey(key);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.promises.readFile(fullPath);
  }

  async has(key: string): Promise<boolean> {
    const fullPath = this.resolveKey(key);
    return fs.existsSync(fullPath);
  }

  async remove(key: string): Promise<boolean> {
    const fullPath = this.resolveKey(key);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

  async removePrefix(prefix: string): Promise<number> {
    const targetDir = this.resolveKey(prefix);
    if (!fs.existsSync(targetDir)) {
      return 0;
    }

    let deletedCount = 0;
    const removeDirRecursive = async (currentPath: string) => {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await removeDirRecursive(full);
          try {
            await fs.promises.rmdir(full);
          } catch {}
        } else {
          await fs.promises.unlink(full);
          deletedCount++;
        }
      }
    };

    const stat = await fs.promises.stat(targetDir);
    if (stat.isDirectory()) {
      await removeDirRecursive(targetDir);
      try {
        await fs.promises.rmdir(targetDir);
      } catch {}
    } else {
      await fs.promises.unlink(targetDir);
      deletedCount++;
    }

    return deletedCount;
  }

  getLocalPath(key: string): string {
    return this.resolveKey(key);
  }
}

/**
 * Cloudflare R2 / AWS S3 storage driver
 */
class S3Driver implements StorageDriver {
  readonly name = 's3';
  private client: S3Client;
  private bucket: string;

  constructor(options: {
    bucket: string;
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  private cleanKey(key: string): string {
    return key.replace(/\.\./g, '').replace(/^\/+/, '');
  }

  async write(key: string, data: Buffer): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.cleanKey(key),
      Body: data,
    });
    await this.client.send(command);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.cleanKey(key),
      });
      const response = await this.client.send(command);
      if (!response.Body) {
        return null;
      }
      if (response.Body instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
      // For web/stream response formats
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.cleanKey(key),
      });
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.cleanKey(key),
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async removePrefix(prefix: string): Promise<number> {
    const cleanPrefix = this.cleanKey(prefix);
    let totalDeleted = 0;
    let continuationToken: string | undefined = undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: cleanPrefix,
        ContinuationToken: continuationToken,
      });

      const listResponse: ListObjectsV2CommandOutput = await this.client.send(listCommand);
      const objects = listResponse.Contents || [];

      if (objects.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objects
              .filter((obj) => Boolean(obj.Key))
              .map((obj) => ({ Key: obj.Key! })),
            Quiet: true,
          },
        });
        await this.client.send(deleteCommand);
        totalDeleted += objects.length;
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    return totalDeleted;
  }
}

/**
 * Initializes the storage driver: checks for Cloudflare R2 / AWS S3 credentials.
 * If credentials are not set, cleanly falls back to local filesystem driver.
 */
function createStorageDriver(rootPath?: string): StorageDriver {
  const bucket =
    process.env.R2_BUCKET ||
    process.env.S3_BUCKET ||
    process.env.AWS_S3_BUCKET;

  const accessKeyId =
    process.env.R2_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID;

  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY;

  if (bucket && accessKeyId && secretAccessKey) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const endpoint =
      process.env.R2_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    const region =
      process.env.R2_REGION ||
      process.env.S3_REGION ||
      process.env.AWS_REGION ||
      (endpoint?.includes('r2.cloudflarestorage.com') ? 'auto' : 'us-east-1');

    return new S3Driver({
      bucket,
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
    });
  }

  // Graceful fallback to local filesystem driver
  return new FsDriver(rootPath);
}

/**
 * High-performance, securely encrypted object store (NFR1.3).
 * Synced payloads, generated PDFs, and artifacts are encrypted at rest using AES-256-GCM.
 * Seamlessly supports both local filesystem and Cloudflare R2 / AWS S3 cloud storage.
 */
export class ObjectStore {
  private driver: StorageDriver;

  constructor(rootPathOrDriver?: string | StorageDriver) {
    if (typeof rootPathOrDriver === 'object') {
      this.driver = rootPathOrDriver;
    } else {
      this.driver = createStorageDriver(rootPathOrDriver);
    }
  }

  get driverName(): string {
    return this.driver.name;
  }

  private cleanKey(key: string): string {
    return key.replace(/^storage:\/\//, '').replace(/\.\./g, '').replace(/^\/+/, '');
  }

  /**
   * Encrypts and writes data to storage at rest (AES-256-GCM).
   */
  async put(key: string, data: Buffer | string): Promise<string> {
    const cleanKey = this.cleanKey(key);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const iv = crypto.randomBytes(12); // 96-bit IV
    const keyBuffer = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16 bytes auth tag

    // Pack envelope: [MAGIC (15B)] + [IV (12B)] + [TAG (16B)] + [CIPHERTEXT]
    const encryptedEnvelope = Buffer.concat([ENVELOPE_MAGIC, iv, tag, ciphertext]);

    await this.driver.write(cleanKey, encryptedEnvelope);
    return `storage://${cleanKey}`;
  }

  /**
   * Reads and decrypts data from storage, validating integrity tag.
   */
  async get(key: string): Promise<Buffer | null> {
    const cleanKey = this.cleanKey(key);
    const rawFile = await this.driver.read(cleanKey);
    if (!rawFile) {
      return null;
    }

    // Check if envelope is encrypted with BALLAST_ENC_V1
    if (
      rawFile.length >= ENVELOPE_MAGIC.length + 28 &&
      rawFile.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)
    ) {
      let offset = ENVELOPE_MAGIC.length;
      const iv = rawFile.subarray(offset, offset + 12);
      offset += 12;
      const tag = rawFile.subarray(offset, offset + 16);
      offset += 16;
      const ciphertext = rawFile.subarray(offset);

      const keyBuffer = getEncryptionKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted;
    }

    // Fallback for legacy unencrypted files
    return rawFile;
  }

  /**
   * Checks existence of an object in storage.
   */
  async exists(key: string): Promise<boolean> {
    const cleanKey = this.cleanKey(key);
    return this.driver.has(cleanKey);
  }

  /**
   * Deletes a single object from storage.
   */
  async delete(key: string): Promise<boolean> {
    const cleanKey = this.cleanKey(key);
    return this.driver.remove(cleanKey);
  }

  /**
   * Deletes all objects matching a workspace prefix.
   */
  async deletePrefix(prefix: string): Promise<number> {
    const cleanPrefix = this.cleanKey(prefix);
    return this.driver.removePrefix(cleanPrefix);
  }

  getFilePath(key: string): string {
    const cleanKey = this.cleanKey(key);
    if (this.driver.getLocalPath) {
      return this.driver.getLocalPath(cleanKey);
    }
    return `storage://${cleanKey}`;
  }
}

export const objectStore = new ObjectStore();
