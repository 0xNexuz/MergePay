import type { Executor } from "./keeperhub.js";
import { evaluate, type Policy } from "./policy.js";
import type { BountyEvent, ExecutionReceipt } from "./types.js";

export class MergePayAgent {
  private processed = new Map<string, ExecutionReceipt>();
  constructor(private policy: Policy, private executor: Executor) {}

  async handle(event: BountyEvent) {
    const existing = this.processed.get(event.deliveryId);
    if (existing) return { decision: evaluate(event, this.policy), receipt: existing, duplicate: true };
    const decision = evaluate(event, this.policy);
    if (!decision.approved) return { decision, duplicate: false };
    const receipt = await this.executor.pay(event);
    this.processed.set(event.deliveryId, receipt);
    return { decision, receipt, duplicate: false };
  }
}
