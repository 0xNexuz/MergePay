import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MergePayAgent } from "./agent.js";
import { KeeperHubExecutor, MockExecutor } from "./keeperhub.js";

const schema = z.object({
  deliveryId: z.string().min(1), repository: z.string().min(3), pullRequest: z.number().int().positive(),
  merged: z.boolean(), labels: z.array(z.string()), contributor: z.string().min(1),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/), amountUsd: z.number().positive()
});
const mode = process.env.KEEPERHUB_MODE ?? "mock";
const executor = mode === "live"
  ? new KeeperHubExecutor(process.env.KEEPERHUB_MCP_URL!, process.env.KEEPERHUB_API_KEY!, process.env.KEEPERHUB_WORKFLOW_SLUG!)
  : new MockExecutor();
const agent = new MergePayAgent({
  repositories: (process.env.ALLOWED_REPOSITORIES ?? "owner/repository").split(","),
  maxPayoutUsd: Number(process.env.MAX_PAYOUT_USD ?? 100)
}, executor);
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDir));
app.get("/health", (_req, res) => res.json({ ok: true, keeperHubMode: mode }));
app.post("/api/bounties/settle", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await agent.handle(parsed.data as Parameters<typeof agent.handle>[0]);
    return res.status(result.decision.approved ? 200 : 422).json(result);
  } catch (error) {
    return res.status(502).json({ error: "KeeperHub execution failed", detail: error instanceof Error ? error.message : String(error) });
  }
});
app.post("/api/webhooks/github", async (req, res) => {
  const secret = process.env.MERGEPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "GitHub webhook is not configured" });
  const signature = req.header("x-hub-signature-256") ?? "";
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody || !validGitHubSignature(rawBody, signature, secret)) return res.status(401).json({ error: "Invalid webhook signature" });
  if (req.header("x-github-event") !== "pull_request") return res.status(202).json({ ignored: true, reason: "unsupported event" });
  const payload = req.body as Record<string, any>;
  if (payload.action !== "closed" || payload.pull_request?.merged !== true) return res.status(202).json({ ignored: true, reason: "pull request was not merged" });
  const body = String(payload.pull_request?.body ?? "");
  const recipient = body.match(/mergepay-recipient:\s*(0x[a-fA-F0-9]{40})/i)?.[1];
  const amount = Number(body.match(/mergepay-amount:\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1]);
  if (!recipient || !Number.isFinite(amount)) return res.status(422).json({ error: "PR body must include mergepay-recipient and mergepay-amount metadata" });
  const event = {
    deliveryId: req.header("x-github-delivery") ?? `github-${payload.pull_request.id}`,
    repository: String(payload.repository?.full_name), pullRequest: Number(payload.pull_request?.number), merged: true,
    labels: (payload.pull_request?.labels ?? []).map((label: any) => String(label.name)),
    contributor: String(payload.pull_request?.user?.login), recipient: recipient as `0x${string}`, amountUsd: amount
  };
  try {
    const result = await agent.handle(event);
    return res.status(result.decision.approved ? 200 : 422).json(result);
  } catch (error) {
    return res.status(502).json({ error: "KeeperHub execution failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

function validGitHubSignature(body: Buffer, signature: string, secret: string) {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

if (!process.env.VERCEL) {
  app.listen(Number(process.env.PORT ?? 3000), () => console.log(`MergePay listening on :${process.env.PORT ?? 3000} (${mode})`));
}

export default app;
