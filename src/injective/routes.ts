// src/injective/routes.ts
// Injective 链上通道路由(加法,不碰原 /v1/chat/completions)。
// 挂载点:server.ts 追加 app.use("/api/injective", injectiveRouter)。

import { Router } from "express";
import { config } from "../config.js";
import type { Tier } from "../config.js";
import { runSwarm } from "../swarm.js";
import { createChain } from "./index.js";
import { SplitExecutor } from "./split-executor.js";
import { payerDecide } from "./payer-agent.js";
import type { OnchainRunRequest, OnchainRunResponse } from "./types.js";

export function createInjectiveRouter(): Router {
  const router = Router();

  // ── GET /api/injective/status ── 健康检查 + 当前链层模式
  router.get("/status", (_req, res) => {
    res.json({
      enabled: config.injective.enabled,
      network: config.injective.network,
      contractAddr: config.injective.splitContractAddr || null,
      chainId: config.injective.chainId,
      denom: config.injective.denom,
      protocolFeeBps: config.injective.protocolFeeBps,
      archetypeAddrsConfigured: Object.keys(config.injective.archetypeAddrs).length,
    });
  });

  // ── GET /api/injective/balance?addr=&denom= ──
  router.get("/balance", async (req, res) => {
    const addr = String(req.query.addr || "").trim();
    const denom = String(req.query.denom || config.injective.denom).trim();
    if (!addr) return res.status(400).json({ error: { type: "invalid_request", message: "addr required" } });
    try {
      const chain = createChain();
      const bal = await chain.getBalance(addr, denom);
      res.json(bal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { type: "balance_error", message: msg } });
    }
  });

  // ── POST /api/injective/run ── 链上版蜂群入口
  router.post("/run", async (req, res) => {
    const body = req.body as OnchainRunRequest;
    if (!body?.goal || !body.goal.trim()) {
      return res.status(400).json({ error: { type: "invalid_request", message: "goal required" } });
    }
    if (!body.senderAddr) {
      return res.status(401).json({ error: { type: "unauthorized", message: "senderAddr (Injective 地址) required" } });
    }

    const tier = (body.tier || "swarm-evo") as Tier;
    const denom = body.budgetDenom || config.injective.denom;
    const total = BigInt(body.budgetAmount || "0");

    try {
      const chain = createChain();

      // 1. 余额校验(同构于原 credits 检查),0 预算时跳过
      if (total > 0n) {
        const bal = await chain.getBalance(body.senderAddr, denom);
        if (BigInt(bal.amount) < total) {
          return res.status(402).json({
            error: {
              type: "insufficient_balance",
              have: bal.amount,
              need: total.toString(),
              denom,
            },
          });
        }
      }

      // 2. 跑蜂群(原内核,零改动)
      const out = await runSwarm({
        tier,
        messages: [{ role: "user", content: body.goal }],
        customTopology: body.topology as never,
      });

      // 3. 分润:payer 决策权重 → split-executor 链上执行
      let payment: OnchainRunResponse["payment"] = null;
      if (total > 0n) {
        const decidedSplits = payerDecide(out.trace as never);
        const executor = new SplitExecutor(chain);
        payment = await executor.distribute({ reward_split: decidedSplits, breakthroughs_broadcast: 0 }, total.toString(), denom, body.senderAddr);
      }

      const response: OnchainRunResponse = {
        content: out.content,
        trace: out.trace,
        payment,
      };
      res.json(response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[injective/run] error:", msg);
      res.status(500).json({ error: { type: "internal_error", message: msg } });
    }
  });

  return router;
}