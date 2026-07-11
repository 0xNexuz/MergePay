import type { BountyEvent, ExecutionReceipt } from "./types.js";

export interface Executor { pay(event: BountyEvent): Promise<ExecutionReceipt> }

export class MockExecutor implements Executor {
  async pay(event: BountyEvent): Promise<ExecutionReceipt> {
    return { executionId: `mock-${event.deliveryId}`, transactionHash: `0x${"ab".repeat(32)}`, transactionLink: undefined, status: "completed", provider: "mock" };
  }
}

type KeeperHubStatus = {
  executionId: string; status: "pending" | "running" | "completed" | "failed";
  transactionHash?: string; transactionLink?: string; error?: string | null;
};

export class KeeperHubExecutor implements Executor {
  constructor(
    private apiBase: string, private apiKey: string, private network: string,
    private tokenAddress: string | undefined
  ) {}

  async pay(event: BountyEvent): Promise<ExecutionReceipt> {
    const body = {
      network: this.network,
      recipientAddress: event.recipient,
      amount: event.amountUsd.toFixed(2),
      ...(this.tokenAddress ? { tokenAddress: this.tokenAddress } : {})
    };
    await this.request("/api/execute/transfer", { ...body, simulate: true }, `${event.deliveryId}:simulate`, false);
    const submitted = await this.request("/api/execute/transfer", body, event.deliveryId, true) as KeeperHubStatus;
    if (!submitted.executionId) throw new Error("KeeperHub did not return an execution ID");
    const status = await this.getStatus(submitted.executionId);
    if (status.status === "failed") throw new Error(status.error ?? "KeeperHub transaction failed");
    if (status.status !== "completed" || !status.transactionHash) throw new Error(`KeeperHub execution is ${status.status}; no confirmed transaction hash returned`);
    return { executionId: status.executionId, transactionHash: status.transactionHash, transactionLink: status.transactionLink, status: "completed", provider: "keeperhub" };
  }

  async simulate(recipientAddress: string, amount: string) {
    return this.request("/api/execute/transfer", {
      network: this.network, recipientAddress, amount,
      ...(this.tokenAddress ? { tokenAddress: this.tokenAddress } : {}), simulate: true
    }, "simulation", false);
  }

  private async getStatus(executionId: string): Promise<KeeperHubStatus> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await this.fetchWithRetry(`${this.apiBase}/api/execute/${encodeURIComponent(executionId)}/status`, { headers: this.headers() });
      const payload = await response.json() as KeeperHubStatus;
      if (payload.status === "completed" || payload.status === "failed") return payload;
      await delay(350 * (attempt + 1));
    }
    throw new Error("KeeperHub execution did not reach a terminal state in time");
  }

  private async request(path: string, body: object, idempotencyKey: string, idempotent: boolean) {
    const response = await this.fetchWithRetry(`${this.apiBase}${path}`, {
      method: "POST", headers: { ...this.headers(), "Content-Type": "application/json", ...(idempotent ? { "Idempotency-Key": `mergepay:${idempotencyKey}` } : {}) },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  private headers() { return { Authorization: `Bearer ${this.apiKey}` }; }

  private async fetchWithRetry(url: string, init: RequestInit) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (response.ok) return response;
      const detail = await response.text();
      if (response.status < 500 && response.status !== 429) throw new Error(`KeeperHub ${response.status}: ${detail}`);
      if (attempt === 3) throw new Error(`KeeperHub unavailable after retries: ${detail}`);
      const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1000;
      await delay(retryAfter || 300 * 2 ** attempt);
    }
    throw new Error("KeeperHub request failed");
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
