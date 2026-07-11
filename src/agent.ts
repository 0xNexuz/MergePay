import type { AuditStore } from "./audit.js";
import type { Executor } from "./keeperhub.js";
import { evaluate, type Policy } from "./policy.js";
import type { AuditRecord, BountyEvent } from "./types.js";

export class MergePayAgent {
  constructor(private policy: Policy, private executor: Executor, private audit: AuditStore) {}

  async handle(event: BountyEvent) {
    const existing = await this.audit.get(event.deliveryId);
    const decision = evaluate(event, this.policy);
    if (existing?.receipt) return { decision, receipt: existing.receipt, duplicate: true };
    if (existing?.status === "executing") return { decision, duplicate: true, pending: true };
    const now = new Date().toISOString();
    if (!decision.approved) {
      await this.audit.save({ deliveryId: event.deliveryId, createdAt: existing?.createdAt ?? now, updatedAt: now, status: "rejected", event, reasons: decision.reasons });
      return { decision, duplicate: false };
    }
    const executing: AuditRecord = { deliveryId: event.deliveryId, createdAt: existing?.createdAt ?? now, updatedAt: now, status: "executing", event, reasons: [] };
    await this.audit.save(executing);
    try {
      const receipt = await this.executor.pay(event);
      await this.audit.save({ ...executing, updatedAt: new Date().toISOString(), status: "completed", receipt });
      return { decision, receipt, duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit.save({ ...executing, updatedAt: new Date().toISOString(), status: "failed", error: message });
      throw error;
    }
  }
}
