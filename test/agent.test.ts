import { describe, expect, it } from "vitest";
import { MergePayAgent } from "../src/agent.js";
import { MockExecutor } from "../src/keeperhub.js";
import { MemoryAuditStore } from "../src/audit.js";

const valid = { deliveryId: "gh-1", repository: "acme/sdk", pullRequest: 42, merged: true,
  labels: ["bounty-approved"], contributor: "octocat", recipient: `0x${"1".repeat(40)}` as const, amountUsd: 25 };

describe("MergePayAgent", () => {
  it("settles an eligible bounty once", async () => {
    const agent = new MergePayAgent({ repositories: ["acme/sdk"], maxPayoutUsd: 100 }, new MockExecutor(), new MemoryAuditStore());
    const first = await agent.handle(valid);
    const second = await agent.handle(valid);
    expect(first.decision.approved).toBe(true);
    expect(first.receipt?.transactionHash).toMatch(/^0x/);
    expect(second.duplicate).toBe(true);
  });
  it("blocks an unmerged PR", async () => {
    const agent = new MergePayAgent({ repositories: ["acme/sdk"], maxPayoutUsd: 100 }, new MockExecutor(), new MemoryAuditStore());
    const result = await agent.handle({ ...valid, deliveryId: "gh-2", merged: false });
    expect(result.decision.approved).toBe(false);
    expect(result.receipt).toBeUndefined();
  });
  it("persists a failed execution without marking it paid", async () => {
    const audit = new MemoryAuditStore();
    const agent = new MergePayAgent({ repositories: ["acme/sdk"], maxPayoutUsd: 100 }, { pay: async () => { throw new Error("chain unavailable"); } }, audit);
    await expect(agent.handle({ ...valid, deliveryId: "gh-fail" })).rejects.toThrow("chain unavailable");
    expect((await audit.get("gh-fail"))?.status).toBe("failed");
    expect((await audit.get("gh-fail"))?.receipt).toBeUndefined();
  });
});
