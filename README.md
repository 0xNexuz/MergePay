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

Send a qualifying event:

```bash
curl -X POST http://localhost:3000/api/bounties/settle -H "content-type: application/json" -d '{"deliveryId":"demo-1","repository":"owner/repository","pullRequest":42,"merged":true,"labels":["bounty-approved"],"contributor":"octocat","recipient":"0x1111111111111111111111111111111111111111","amountUsd":25}'
```

Mock mode returns a deterministic transaction hash. For a real submission transaction, create/list a KeeperHub workflow that accepts the payload fields in `.env.example`, set `KEEPERHUB_MODE=live`, and provide an organisation-scoped `kh_` API key.

## Configure the GitHub webhook

Generate the secret yourself; it is not issued by GitHub or KeeperHub. For example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

1. Copy the generated value into `MERGEPAY_WEBHOOK_SECRET` in `.env`.
2. In the GitHub repository, open **Settings → Webhooks → Add webhook**.
3. Set the payload URL to `https://YOUR_DOMAIN/api/webhooks/github`.
4. Choose `application/json`, paste the same value into **Secret**, and select **Pull requests** events.
5. Add these lines to an eligible PR description before it is merged:

```text
mergepay-recipient: 0x1111111111111111111111111111111111111111
mergepay-amount: 25
```

The PR must also have the `bounty-approved` label. MergePay validates GitHub's `X-Hub-Signature-256` signature before evaluating or executing the payout.

## Safety properties

- Repository allowlist and payout ceiling
- Explicit `bounty-approved` label
- Idempotency by webhook delivery ID
- No wallet private key in this application
- KeeperHub failure is surfaced without marking the bounty paid
