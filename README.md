# MergePay

MergePay is an autonomous bounty settlement agent. It checks a merged pull request against a transparent payout policy and delegates the real onchain transfer to KeeperHub.

## Why KeeperHub

KeeperHub is the execution boundary: MergePay decides *whether* a bounty should be paid; KeeperHub performs and records the onchain action with managed gas, retries, and execution logs.

## Run locally

```bash
npm install
copy .env.example .env
npm test
npm run dev
```

Send a qualifying event in mock mode:

```bash
curl -X POST http://localhost:3000/api/bounties/settle -H "content-type: application/json" -d '{"deliveryId":"demo-1","repository":"owner/repository","pullRequest":42,"merged":true,"labels":["bounty-approved"],"contributor":"octocat","recipient":"0x1111111111111111111111111111111111111111","amountUsd":25}'
```

Mock mode returns a deterministic transaction hash. Live mode uses KeeperHub's Direct Execution API: it simulates the ERC-20 transfer, executes with an organization-scoped idempotency key, polls the execution status, and only records completion when KeeperHub returns a real transaction hash.

Required live variables:

```text
KEEPERHUB_MODE=live
KEEPERHUB_API_KEY=kh_...
KEEPERHUB_API_URL=https://app.keeperhub.com
KEEPERHUB_NETWORK=base
KEEPERHUB_TOKEN_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
MERGEPAY_ADMIN_TOKEN=<random 32-byte secret>
BLOB_READ_WRITE_TOKEN=<private Vercel Blob token>
```

`GET /api/readiness` reports whether every production dependency is configured without exposing secret values.

## Configure the GitHub webhook

Generate the secret yourself; it is not issued by GitHub or KeeperHub. For example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

1. Copy the generated value into `MERGEPAY_WEBHOOK_SECRET` in `.env`.
2. In the GitHub repository, open **Settings → Webhooks → Add webhook**.
3. Set the payload URL to `https://YOUR_DOMAIN/api/webhooks/github`.
4. Choose `application/json`, paste the same value into **Secret**, and select **Pull requests** events.
5. Add this line to an eligible PR description before it is merged:

```text
mergepay-recipient: 0x1111111111111111111111111111111111111111
```

6. Add `bounty-usdc:25` and `bounty-approved` as maintainer-controlled GitHub labels. The amount is never trusted from contributor-editable PR text.

MergePay validates GitHub's `X-Hub-Signature-256` signature before evaluating or executing the payout.

## Safety properties

- Repository allowlist and payout ceiling
- Explicit `bounty-approved` label
- KeeperHub organization-scoped idempotency keyed by GitHub delivery ID
- Durable decision and receipt audit records through private Vercel Blob storage
- Dry-run simulation before every live transfer
- Direct live settlement requires a separate admin bearer token
- No wallet private key in this application
- KeeperHub failure is surfaced without marking the bounty paid
