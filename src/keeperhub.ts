import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BountyEvent, ExecutionReceipt } from "./types.js";

export interface Executor { pay(event: BountyEvent): Promise<ExecutionReceipt> }

export class MockExecutor implements Executor {
  async pay(event: BountyEvent): Promise<ExecutionReceipt> {
    return { executionId: `mock-${event.deliveryId}`, transactionHash: `0x${"ab".repeat(32)}`, status: "completed", provider: "mock" };
  }
}

export class KeeperHubExecutor implements Executor {
  constructor(private url: string, private apiKey: string, private workflowSlug: string) {}

  async pay(event: BountyEvent): Promise<ExecutionReceipt> {
    const client = new Client({ name: "mergepay", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: { headers: { Authorization: `Bearer ${this.apiKey}` } }
    });
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: "call_workflow",
        arguments: { slug: this.workflowSlug, inputs: {
          recipient: event.recipient,
          amountUsd: event.amountUsd,
          repository: event.repository,
          pullRequest: event.pullRequest,
          deliveryId: event.deliveryId
        }}
      });
      const payload = extractJson(result.content);
      return {
        executionId: String(payload.executionId ?? payload.id ?? event.deliveryId),
        transactionHash: typeof payload.transactionHash === "string" ? payload.transactionHash : undefined,
        status: payload.transactionHash ? "completed" : "submitted",
        provider: "keeperhub"
      };
    } finally { await client.close(); }
  }
}

function extractJson(content: unknown): Record<string, unknown> {
  if (!Array.isArray(content)) return {};
  for (const item of content) {
    if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
      try { return JSON.parse(item.text); } catch { /* continue */ }
    }
  }
  return {};
}
