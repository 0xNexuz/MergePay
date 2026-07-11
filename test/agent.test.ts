import { describe, expect, it } from "vitest";
import { MergePayAgent } from "../src/agent.js";
import { MockExecutor } from "../src/keeperhub.js";

const valid = { deliveryId: "gh-1", repository: "acme/sdk", pullRequest: 42, merged: true,
  labels: ["bounty-approved"], contributor: "octocat", recipient: `0x${"1".repeat(40)}` as const, amountUsd: 25 };

describe("MergePayAgent", () => {
  it("settles an eligible bounty once", async () => {
    const agent = new MergePayAgent({ repositories: ["acme/sdk"], maxPayoutUsd: 100 }, new MockExecutor());
    const first = await agent.handle(valid);
    const second = await agent.handle(valid);
    expect(first.decision.approved).toBe(true);
    expect(first.receipt?.transactionHash).toMatch(/^0x/);
    expect(second.duplicate).toBe(true);
  });
  it("blocks an unmerged PR", async () => {
    const agent = new MergePayAgent({ repositories: ["acme/sdk"], maxPayoutUsd: 100 }, new MockExecutor());
    const result = await agent.handle({ ...valid, deliveryId: "gh-2", merged: false });
    expect(result.decision.approved).toBe(false);
    expect(result.receipt).toBeUndefined();
  });
});
