export type BountyEvent = {
  deliveryId: string;
  repository: string;
  pullRequest: number;
  merged: boolean;
  labels: string[];
  contributor: string;
  recipient: `0x${string}`;
  amountUsd: number;
};

export type Decision = {
  approved: boolean;
  reasons: string[];
  event: BountyEvent;
};

export type ExecutionReceipt = {
  executionId: string;
  transactionHash?: string;
  status: "submitted" | "completed";
  provider: "keeperhub" | "mock";
};
