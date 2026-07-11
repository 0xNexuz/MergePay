# MergePay

**MergePay turns an approved GitHub pull request into a policy-checked, auditable USDC payout executed onchain through KeeperHub.**

- Live app: https://mergepay-six.vercel.app
- Product docs: https://mergepay-six.vercel.app/docs
- Execution sponsor: [KeeperHub](https://keeperhub.com)

## Verified mainnet proof

MergePay has executed a real `0.01 USDC` payout on Base mainnet through KeeperHub:

- KeeperHub execution: `kyc2ywxx5hs3afpo6qtkw`
- Transaction: [`0xd97f72…3000d0`](https://basescan.org/tx/0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0)
- Recipient: `0x24570d70b3c80BD6A1736320D8e0E2636EB6E065`
- Status: confirmed and recorded in the durable MergePay audit

## The problem

Open-source bounty payments are usually manual. A maintainer must verify that work merged, recover the contributor's wallet, check the promised amount, open a treasury wallet, send the transaction, and preserve evidence. That process is slow, inconsistent, and vulnerable to duplicate payments or human error.

## What MergePay does

1. A maintainer labels a pull request `bounty-approved` and `bounty-usdc:25`.
2. The contributor includes `mergepay-recipient: 0x...` in the PR description.
3. GitHub sends a signed webhook when the PR is merged.
4. MergePay verifies the signature and evaluates repository, label, address, amount, and replay policies.
5. MergePay simulates the ERC-20 transfer through KeeperHub.
6. KeeperHub executes using an idempotency key derived from the GitHub delivery ID.
7. MergePay refuses to mark the bounty complete until KeeperHub returns a confirmed transaction hash.
8. The decision, execution ID and explorer URL are saved to the private audit store and displayed in the app.

```text
GitHub merge → signed webhook → MergePay policy engine
             → KeeperHub simulation → KeeperHub execution
             → Base USDC transaction → durable audit receipt
```

## Why KeeperHub is essential

MergePay decides **whether** a payout is authorized. KeeperHub is the sponsor-provided execution and reliability boundary that performs the blockchain operation.

The integration uses KeeperHub's Direct Execution API for:

- Preflight transaction simulation
- Managed wallet execution without a private key in MergePay
- Gas estimation and transaction submission
- Organization-scoped idempotency to prevent duplicate broadcasts
- Rate-limit-aware retries
- Execution status, transaction hash and explorer receipt
- KeeperHub's own execution audit trail

Without KeeperHub, MergePay would only be an approval dashboard. With KeeperHub, an approved decision becomes a real onchain action.

## Security and reliability

- GitHub `X-Hub-Signature-256` validation with timing-safe comparison
- Maintainer-controlled payout labels; amounts are never trusted from PR text
- Repository allowlist and maximum-payout policy
- KeeperHub idempotency keyed by GitHub delivery ID
- Simulation before every live transaction
- Private Vercel Blob audit storage
- Direct live endpoint protected by a separate admin bearer token
- Mock/live environment separation
- Exponential retry handling for transient KeeperHub and rate-limit failures
- Failed executions are recorded but never marked paid
- A real transaction hash is mandatory for completed live receipts

## Network and token

Production is configured for **Base mainnet** (`chainId 8453`) and canonical Circle USDC:

```text
Network: base
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

This is real USDC. Do not enable live mode unless the KeeperHub organization wallet is intentionally funded and spending caps are configured.

KeeperHub also recognizes Base Sepolia (`base-sepolia`, chain ID `84532`). Testnet use requires a verified Base Sepolia ERC-20 address and test tokens; the Base mainnet USDC address above must not be treated as a testnet token.

## Go-live checklist

1. Fund the KeeperHub organization wallet with enough Base USDC for the chosen bounty.
2. Fund the same wallet with a small amount of Base ETH if the organization does not have applicable gas sponsorship.
3. Run the admin-only `/api/admin/simulate` check. It must return `wouldRevert: false`.
4. Configure KeeperHub spending caps below the treasury's acceptable daily exposure.
5. Set `KEEPERHUB_MODE=live` and redeploy.
6. Start with the maintainer-controlled `bounty-usdc:0.01` label and an approved recipient wallet.
7. Merge the test PR, then preserve the KeeperHub execution ID, Base transaction hash and audit receipt.

## GitHub setup

Create maintainer-controlled labels:

```text
bounty-approved
bounty-usdc:25
```

Add the contributor wallet to the PR description:

```text
mergepay-recipient: 0x1111111111111111111111111111111111111111
```

Configure the webhook:

```text
Payload URL: https://mergepay-six.vercel.app/api/webhooks/github
Content type: application/json
Events: Pull requests
Secret: same value as MERGEPAY_WEBHOOK_SECRET
```

## Production environment

```text
KEEPERHUB_MODE=live
KEEPERHUB_API_KEY=kh_...
KEEPERHUB_API_URL=https://app.keeperhub.com
KEEPERHUB_NETWORK=base
KEEPERHUB_TOKEN_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
MERGEPAY_WEBHOOK_SECRET=<random 32-byte secret>
MERGEPAY_ADMIN_TOKEN=<different random 32-byte secret>
BLOB_READ_WRITE_TOKEN=<connected private Vercel Blob store>
MAX_PAYOUT_USD=100
ALLOWED_REPOSITORIES=0xNexuz/MergePay
```

Never commit these values. `GET /api/readiness` reports configuration state without returning secrets.

## Local development

```bash
npm install
copy .env.example .env
npm test
npm run dev
```

Open http://localhost:3000.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Process health and execution mode |
| `GET /api/readiness` | Production dependency gates |
| `GET /api/executions` | Recent decision and transaction audit records |
| `POST /api/webhooks/github` | Signed GitHub pull-request events |
| `POST /api/bounties/settle` | Mock testing; requires admin bearer token live |
| `POST /api/admin/simulate` | Admin-only, non-broadcast KeeperHub transfer simulation |

## Tests

```bash
npm test
npm run typecheck
```

The suite covers policy rejection, duplicate delivery behavior, failure persistence, KeeperHub simulation, idempotency headers, status retrieval, and refusal to claim success without a transaction hash.

## Submission evidence checklist

- Public source and deployment
- Signed GitHub webhook path
- KeeperHub execution ID and run evidence: `kyc2ywxx5hs3afpo6qtkw`
- [Real Base transaction hash and explorer receipt](https://basescan.org/tx/0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0)
- Audit record shown in the MergePay interface
- Retry/idempotency demonstration

## License

MIT
