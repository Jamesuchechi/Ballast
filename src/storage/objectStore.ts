import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.resolve(process.cwd(), '.storage');

// Ensure base storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

export interface ObjectMetadata {
  contentType?: string;
  size: number;
  updatedAt: Date;
}

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

  async put(key: string, data: Buffer | string): Promise<string> {
    const fullPath = this.resolveKey(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, data);
    return `storage://${key}`;
  }

  async get(key: string): Promise<Buffer | null> {
    const cleanKey = key.replace(/^storage:\/\//, '');
    const fullPath = this.resolveKey(cleanKey);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.promises.readFile(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    const cleanKey = key.replace(/^storage:\/\//, '');
    const fullPath = this.resolveKey(cleanKey);
    return fs.existsSync(fullPath);
  }

  getFilePath(key: string): string {
    const cleanKey = key.replace(/^storage:\/\//, '');
    return this.resolveKey(cleanKey);
  }
}

export const objectStore = new ObjectStore();
