import type { BountyEvent, Decision } from "./types.js";

export type Policy = { repositories: string[]; maxPayoutUsd: number };

export function evaluate(event: BountyEvent, policy: Policy): Decision {
  const reasons: string[] = [];
  if (!event.merged) reasons.push("pull request is not merged");
  if (!event.labels.includes("bounty-approved")) reasons.push("missing bounty-approved label");
  if (!policy.repositories.includes(event.repository)) reasons.push("repository is not allowlisted");
  if (event.amountUsd <= 0 || event.amountUsd > policy.maxPayoutUsd) reasons.push("payout exceeds policy limit");
  if (!/^0x[a-fA-F0-9]{40}$/.test(event.recipient)) reasons.push("recipient is not a valid EVM address");
  return { approved: reasons.length === 0, reasons, event };
}
