import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = path.resolve(process.cwd(), '.storage');

// Ensure base storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const MASTER_KEY_SEED =
  process.env.BALLAST_ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  'ballast_default_aes_256_gcm_master_key_seed_2026';

const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_KEY_SEED).digest();
const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_MAGIC = Buffer.from('BALLAST_ENC_V1:', 'utf8'); // 15 bytes magic header

export interface ObjectMetadata {
  contentType?: string;
  size: number;
  updatedAt: Date;
}

/**
 * High-performance, securely encrypted local object store (NFR1.3).
 * Synced payloads, generated PDFs, and artifacts are encrypted at rest using AES-256-GCM.
 */
export class ObjectStore {
  private root: string;

  constructor(rootPath = STORAGE_ROOT) {
    this.root = rootPath;
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  private resolveKey(key: string): string {
    // Prevent path traversal
    const safeKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    const fullPath = path.join(this.root, safeKey);
    return fullPath;
  }

  /**
   * Encrypts and writes data to disk at rest (AES-256-GCM).
   */
  async put(key: string, data: Buffer | string): Promise<string> {
    const fullPath = this.resolveKey(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const iv = crypto.randomBytes(12); // 96-bit IV
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16 bytes auth tag

    // Pack envelope: [MAGIC (15B)] + [IV (12B)] + [TAG (16B)] + [CIPHERTEXT]
    const encryptedEnvelope = Buffer.concat([ENVELOPE_MAGIC, iv, tag, ciphertext]);

    await fs.promises.writeFile(fullPath, encryptedEnvelope);
    return `storage://${key}`;
  }

  /**
   * Reads and decrypts data from disk, validating integrity tag.
   */
  async get(key: string): Promise<Buffer | null> {
    const cleanKey = key.replace(/^storage:\/\//, '');
    const fullPath = this.resolveKey(cleanKey);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const rawFile = await fs.promises.readFile(fullPath);

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

      const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted;
    }

    // Fallback for legacy unencrypted files
    return rawFile;
  }

  /**
   * Checks existence of an object.
   */
  async exists(key: string): Promise<boolean> {
    const cleanKey = key.replace(/^storage:\/\//, '');
    const fullPath = this.resolveKey(cleanKey);
    return fs.existsSync(fullPath);
  }

  /**
   * Deletes a single object from storage.
   */
  async delete(key: string): Promise<boolean> {
    const cleanKey = key.replace(/^storage:\/\//, '');
    const fullPath = this.resolveKey(cleanKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

  /**
   * Deletes all objects matching a workspace prefix (used in per-source & account wipe).
   */
  async deletePrefix(prefix: string): Promise<number> {
    const cleanPrefix = prefix.replace(/^storage:\/\//, '').replace(/^\/+/, '');
    const targetDir = this.resolveKey(cleanPrefix);

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

  getFilePath(key: string): string {
    const cleanKey = key.replace(/^storage:\/\//, '');
    return this.resolveKey(cleanKey);
  }
}

export const objectStore = new ObjectStore();
