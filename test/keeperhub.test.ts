import { afterEach, describe, expect, it, vi } from "vitest";
import { KeeperHubExecutor } from "../src/keeperhub.js";

const event = { deliveryId: "delivery-1", repository: "acme/sdk", pullRequest: 42, merged: true,
  labels: ["bounty-approved", "bounty-usdc:25"], contributor: "octocat", recipient: `0x${"1".repeat(40)}` as const, amountUsd: 25 };

describe("KeeperHubExecutor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("simulates, executes idempotently, and requires a confirmed transaction hash", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, status: "simulated" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ executionId: "direct_1", status: "completed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ executionId: "direct_1", status: "completed", transactionHash: `0x${"2".repeat(64)}`, transactionLink: "https://basescan.org/tx/0x2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const receipt = await new KeeperHubExecutor("https://keeperhub.test", "kh_test", "base", "0xToken").pay(event);
    expect(receipt.provider).toBe("keeperhub");
    expect(receipt.transactionHash).toMatch(/^0x/);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe("mergepay:delivery-1");
  });

  it("never reports completion without an onchain hash", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ executionId: "direct_2", status: "completed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ executionId: "direct_2", status: "completed" }), { status: 200 })));
    await expect(new KeeperHubExecutor("https://keeperhub.test", "kh_test", "base", "0xToken").pay(event)).rejects.toThrow("no confirmed transaction hash");
  });
});
