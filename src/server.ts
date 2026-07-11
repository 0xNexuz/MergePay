import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MergePayAgent } from "./agent.js";
import { KeeperHubExecutor, MockExecutor } from "./keeperhub.js";
import { createAuditStore } from "./audit.js";

const schema = z.object({
  deliveryId: z.string().min(1), repository: z.string().min(3), pullRequest: z.number().int().positive(),
  merged: z.boolean(), labels: z.array(z.string()), contributor: z.string().min(1),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/), amountUsd: z.number().positive()
});
const mode = process.env.KEEPERHUB_MODE ?? "mock";
const liveExecutor = new KeeperHubExecutor(process.env.KEEPERHUB_API_URL ?? "https://app.keeperhub.com", process.env.KEEPERHUB_API_KEY ?? "", process.env.KEEPERHUB_NETWORK ?? "base", process.env.KEEPERHUB_TOKEN_ADDRESS);
const executor = mode === "live" ? liveExecutor : new MockExecutor();
const audit = createAuditStore();
const agent = new MergePayAgent({
  repositories: (process.env.ALLOWED_REPOSITORIES ?? "owner/repository").split(","),
  maxPayoutUsd: Number(process.env.MAX_PAYOUT_USD ?? 100)
}, executor, audit);
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
app.use(express.static(publicDir));
app.get(["/health", "/api/health"], (_req, res) => res.json({ ok: true, keeperHubMode: mode, durableAudit: audit.durable }));
app.get("/api/readiness", (_req, res) => {
  const validKeeperHubKey = /^kh_[A-Za-z0-9_-]{10,}$/.test(process.env.KEEPERHUB_API_KEY ?? "");
  const checks = {
    liveMode: mode === "live", keeperHubKey: validKeeperHubKey,
    tokenConfigured: Boolean(process.env.KEEPERHUB_TOKEN_ADDRESS), durableAudit: audit.durable,
    webhookSecret: Boolean(process.env.MERGEPAY_WEBHOOK_SECRET), adminToken: Boolean(process.env.MERGEPAY_ADMIN_TOKEN)
  };
  const liveReady = Object.values(checks).every(Boolean);
  return res.status(liveReady ? 200 : 503).json({ liveReady, checks, network: process.env.KEEPERHUB_NETWORK ?? "base" });
});
app.get("/api/executions", async (req, res) => {
  try { return res.json({ executions: await audit.list(Math.max(1, Math.min(50, Number(req.query.limit ?? 10)))) }); }
  catch (error) { return res.status(503).json({ error: "Audit history unavailable", detail: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/admin/simulate", async (req, res) => {
  if (!process.env.MERGEPAY_ADMIN_TOKEN || req.header("authorization") !== `Bearer ${process.env.MERGEPAY_ADMIN_TOKEN}`) return res.status(401).json({ error: "Admin authorization required" });
  try {
    const recipient = typeof req.body?.recipient === "string" ? req.body.recipient : "0x000000000000000000000000000000000000dEaD";
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) return res.status(400).json({ error: "Valid EVM recipient required" });
    const result = await liveExecutor.simulate(recipient, "0.01");
    return res.json({ success: true, network: process.env.KEEPERHUB_NETWORK ?? "base", tokenAddress: process.env.KEEPERHUB_TOKEN_ADDRESS, simulation: result });
  } catch (error) {
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.post("/api/bounties/settle", async (req, res) => {
  if (mode === "live" && req.header("authorization") !== `Bearer ${process.env.MERGEPAY_ADMIN_TOKEN}`) return res.status(401).json({ error: "Admin authorization required for direct live settlement" });
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
  const labelNames = (payload.pull_request?.labels ?? []).map((label: any) => String(label.name));
  const bountyLabel = labelNames.find((name: string) => /^bounty-usdc:\d+(?:\.\d{1,2})?$/i.test(name));
  const amount = Number(bountyLabel?.split(":")[1]);
  if (!recipient || !Number.isFinite(amount)) return res.status(422).json({ error: "PR requires mergepay-recipient metadata and a maintainer-controlled bounty-usdc:AMOUNT label" });
  const event = {
    deliveryId: req.header("x-github-delivery") ?? `github-${payload.pull_request.id}`,
    repository: String(payload.repository?.full_name), pullRequest: Number(payload.pull_request?.number), merged: true,
    labels: labelNames,
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
app.get("/docs", (_req, res) => res.sendFile(path.join(publicDir, "docs.html")));
app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

if (!process.env.VERCEL) {
  app.listen(Number(process.env.PORT ?? 3000), () => console.log(`MergePay listening on :${process.env.PORT ?? 3000} (${mode})`));
}

export default app;
