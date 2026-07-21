# MergePay

> Autonomous, policy-controlled USDC payouts for open-source contributors, executed onchain through KeeperHub.

[Live app](https://mergepay-six.vercel.app) | [MergePay docs](https://mergepay-six.vercel.app/docs) | [Verified Base transaction](https://basescan.org/tx/0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0)

## The result

MergePay turns an approved and merged GitHub pull request into a real USDC payment. It verifies the GitHub event, applies treasury policy, simulates the transfer, asks KeeperHub to execute it, waits for onchain confirmation, and stores an auditable receipt.

**This is a working mainnet integration, not a mocked payment flow.**

| Proof | Value |
|---|---|
| Network | Base mainnet (`8453`) |
| Asset | Canonical Circle USDC |
| Amount | `0.01 USDC` |
| Recipient | `0x24570d70b3c80BD6A1736320D8e0E2636EB6E065` |
| KeeperHub execution ID | `kyc2ywxx5hs3afpo6qtkw` |
| Transaction | [`0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0`](https://basescan.org/tx/0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0) |
| Outcome | Confirmed and stored in MergePay's durable audit log |

## The problem

Paying an open-source bounty is still a fragmented manual process. A maintainer has to confirm that the work was merged, find the contributor's wallet, verify the promised amount, operate a treasury wallet, avoid paying twice, and preserve evidence of the transfer.

That process is slow, difficult to audit, and dangerous to automate with an unrestricted private key.

## The solution

MergePay separates **authorization** from **execution**:

- **GitHub supplies the proof of completed work.**
- **MergePay decides whether the payout complies with treasury policy.**
- **KeeperHub safely executes the approved transaction onchain.**
- **Base provides public settlement proof.**

The application never stores a treasury private key. KeeperHub remains the controlled execution boundary, while MergePay limits when, where, and how much the agent is allowed to pay.

## How it works

1. A contributor adds `mergepay-recipient: 0x...` to a pull request description.
2. A maintainer applies `bounty-approved` and an amount label such as `bounty-usdc:25`.
3. The pull request is merged and GitHub sends a signed webhook.
4. MergePay authenticates the payload and checks the repository, merge state, labels, recipient, amount ceiling, and replay state.
5. MergePay asks KeeperHub to simulate the ERC-20 transfer.
6. If simulation succeeds, KeeperHub executes the transfer with an idempotency key derived from the GitHub delivery ID.
7. MergePay polls the execution and only reports success after receiving a confirmed transaction hash.
8. The decision, KeeperHub execution ID, transaction hash, and explorer link are written to the durable audit store.

```text
GitHub PR merged
      |
      v
Signed webhook --> MergePay policy engine --> KeeperHub simulation
                                                |
                                                v
Durable receipt <-- Base confirmation <-- KeeperHub execution
```

## Why KeeperHub is essential

KeeperHub is not a decorative API call. It is the execution and reliability layer that turns MergePay's approved decision into an onchain transaction.

MergePay uses KeeperHub for:

- Preflight transaction simulation
- Managed-wallet execution without exposing a private key to the application
- Gas estimation and transaction submission
- Organization-scoped idempotency to prevent duplicate broadcasts
- Execution status polling and transaction receipts
- Retry handling for transient failures and rate limits
- An additional provider-side execution audit trail

Without KeeperHub, MergePay would only approve a payout. With KeeperHub, it completes and proves the payout onchain.

## Judging-criteria coverage

### Onchain execution through KeeperHub

The project has transferred real canonical USDC on Base mainnet through KeeperHub. The execution ID and public BaseScan receipt are included above.

### Use of KeeperHub surfaces

The integration exercises simulation, managed execution, idempotency, status retrieval, transaction receipts, gas handling, retry behavior, and KeeperHub's execution trail.

### Reliability and observability

- Simulation occurs before every live transfer.
- GitHub delivery IDs become KeeperHub idempotency keys.
- Duplicate webhook deliveries return the original result instead of paying twice.
- Live success requires a confirmed transaction hash.
- Failed attempts are recorded and are never presented as completed payouts.
- Durable audit records preserve policy decisions and execution evidence.
- Health and readiness endpoints expose operational state without exposing secrets.

### Originality and real-world usefulness

MergePay connects proof of completed open-source work directly to a guarded treasury action. It removes repetitive maintainer work while keeping approval, payout limits, recipient validation, and public settlement proof explicit.

### Integration quality and developer experience

The repository includes a signed webhook endpoint, direct settlement endpoint, simulation endpoint, readiness checks, automated tests, environment template, production deployment, product documentation, and a reproducible GitHub-label workflow.

## Security model

- GitHub `X-Hub-Signature-256` verification using SHA-256 HMAC and timing-safe comparison
- Maintainer-controlled approval and amount labels
- Repository allowlist
- Configurable maximum payout ceiling
- Recipient address validation
- KeeperHub simulation before broadcast
- End-to-end replay protection and idempotency
- Separate admin bearer token for privileged endpoints in live mode
- Private Vercel Blob audit storage
- Strict mock/live environment separation
- No treasury private key stored by MergePay

## Network and token

Production uses **Base mainnet** and **real canonical Circle USDC**:

```text
Network: base
Chain ID: 8453
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

The configured token is not testnet USDC. KeeperHub can also target Base Sepolia (`84532`), but a testnet deployment must use an appropriate verified test token address and test funds. Never reuse the Base-mainnet token address as if it were a testnet asset.

## Quick demo

For the safest hackathon demo, reuse the verified transaction rather than spending funds again:

1. Open the [live application](https://mergepay-six.vercel.app) and introduce the approved-PR-to-USDC workflow.
2. Show the policy controls: repository allowlist, approval label, amount label, payout ceiling, and contributor recipient address.
3. Explain that each transfer is simulated before execution and keyed to the GitHub delivery ID to prevent duplicates.
4. Show the execution receipt and KeeperHub execution ID `kyc2ywxx5hs3afpo6qtkw`.
5. Open the [confirmed BaseScan transaction](https://basescan.org/tx/0xd97f72f6a284c4f51d866ce22e18ef6f6bcb713b910bc78c40eddb8c3a3000d0).
6. State clearly: "This is real Base-mainnet USDC executed through KeeperHub, not a mocked transaction."

## GitHub webhook setup

Create maintainer-controlled labels:

```text
bounty-approved
bounty-usdc:25
```

The amount label is authoritative. Add the contributor's destination to the pull request description:

```text
mergepay-recipient: 0x1111111111111111111111111111111111111111
```

In the GitHub repository, open **Settings > Webhooks > Add webhook** and configure:

```text
Payload URL: https://mergepay-six.vercel.app/api/webhooks/github
Content type: application/json
Secret: the same value as MERGEPAY_WEBHOOK_SECRET
Events: Pull requests
Active: enabled
```

Generate the webhook secret locally, then place the value in both GitHub and Vercel:

```bash
openssl rand -hex 32
```

## Production configuration

```text
KEEPERHUB_MODE=live
KEEPERHUB_API_KEY=kh_...
KEEPERHUB_API_URL=https://app.keeperhub.com
KEEPERHUB_NETWORK=base
KEEPERHUB_TOKEN_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
MERGEPAY_WEBHOOK_SECRET=<random 32-byte secret>
MERGEPAY_ADMIN_TOKEN=<different random 32-byte secret>
BLOB_READ_WRITE_TOKEN=<private Vercel Blob store token>
MAX_PAYOUT_USD=100
ALLOWED_REPOSITORIES=0xNexuz/MergePay
```

Never commit these values. `GET /api/readiness` reports whether required services are configured without returning their secrets.

### Go-live checklist

1. Fund the KeeperHub organization wallet with sufficient Base USDC.
2. Add a small amount of Base ETH unless applicable gas sponsorship is active.
3. Configure KeeperHub spending caps appropriate for the treasury.
4. Run the admin-only `/api/admin/simulate` check and require `wouldRevert: false`.
5. Confirm `/api/readiness` reports all production gates ready.
6. Start with a maintainer-controlled `bounty-usdc:0.01` label.
7. Merge the test pull request and verify the KeeperHub execution ID, Base transaction, and MergePay audit receipt.

## Local development

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/0xNexuz/MergePay.git
cd MergePay
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## API reference

| Endpoint | Purpose | Protection |
|---|---|---|
| `GET /api/health` | Process health and current execution mode | Public |
| `GET /api/readiness` | Production dependency gates | Public, no secret values returned |
| `GET /api/executions` | Recent decision and transaction audit records | Application route |
| `POST /api/webhooks/github` | Receive signed pull-request events | GitHub HMAC signature |
| `POST /api/bounties/settle` | Submit a direct settlement request | Admin bearer token in live mode |
| `POST /api/admin/simulate` | Simulate a transfer without broadcasting | Admin bearer token |

## Testing

```bash
npm test
npm run typecheck
```

The automated suite covers policy rejection, duplicate delivery behavior, failure persistence, KeeperHub simulation, idempotency headers, status retrieval, and refusal to claim live success without a transaction hash.

## Project status

- Live production deployment: complete
- GitHub-to-MergePay webhook path: complete
- KeeperHub simulation and execution: complete
- Durable audit storage: complete
- Verified Base-mainnet USDC payout: complete
- Public transaction evidence: complete

## Built for The Last Mile

MergePay was built for KeeperHub's **The Last Mile** hackathon. It focuses on the event the challenge values most: an agent performing a useful, reliable, observable, and verifiable onchain action through KeeperHub.

## License

MIT
