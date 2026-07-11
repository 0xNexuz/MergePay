import { get, list, put } from "@vercel/blob";
import type { AuditRecord } from "./types.js";

export interface AuditStore {
  get(deliveryId: string): Promise<AuditRecord | undefined>;
  save(record: AuditRecord): Promise<void>;
  list(limit: number): Promise<AuditRecord[]>;
  readonly durable: boolean;
}

export class MemoryAuditStore implements AuditStore {
  readonly durable = false;
  private records = new Map<string, AuditRecord>();
  async get(id: string) { return this.records.get(id); }
  async save(record: AuditRecord) { this.records.set(record.deliveryId, record); }
  async list(limit: number) { return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
}

export class BlobAuditStore implements AuditStore {
  readonly durable = true;
  private path(id: string) { return `audit/${encodeURIComponent(id)}.json`; }
  async get(id: string) {
    const result = await get(this.path(id), { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result?.stream) return undefined;
    return JSON.parse(await new Response(result.stream).text()) as AuditRecord;
  }
  async save(record: AuditRecord) {
    await put(this.path(record.deliveryId), JSON.stringify(record), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token: process.env.BLOB_READ_WRITE_TOKEN });
  }
  async list(limit: number) {
    const result = await list({ prefix: "audit/", limit: Math.min(limit, 100), token: process.env.BLOB_READ_WRITE_TOKEN });
    const records = await Promise.all(result.blobs.map(async blob => {
      const item = await get(blob.pathname, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
      return item?.stream ? JSON.parse(await new Response(item.stream).text()) as AuditRecord : undefined;
    }));
    return records.filter((record): record is AuditRecord => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function createAuditStore(): AuditStore {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN ? new BlobAuditStore() : new MemoryAuditStore();
}
