import { Router } from "express";
import { getBrokerAdapter } from "../brokers/BrokerService.js";

const router = Router();

router.get("/broker/mt5/balance", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  try {
    const balances = await ctx.adapter.getBalance();
    const main = balances[0];
    res.json({ ok: true, balance: main, all: balances });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

router.get("/broker/mt5/positions", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  try {
    const positions = await ctx.adapter.getPositions();
    res.json({ ok: true, positions });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

router.get("/broker/mt5/orders", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  try {
    const orders = await ctx.adapter.getOrders();
    res.json({ ok: true, orders });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

router.post("/broker/mt5/order", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  try {
    const result = await ctx.adapter.placeOrder(req.body);
    res.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

router.delete("/broker/mt5/order/:id", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  try {
    await ctx.adapter.cancelOrder(req.params["id"]!);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

router.delete("/broker/mt5/position/:id", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "mt5") {
    res.status(400).json({ ok: false, error: "Account is not an MT5 account" });
    return;
  }
  const { size, side } = req.body as { size: number; side: "Long" | "Short" };
  try {
    await ctx.adapter.closePosition({
      id: req.params["id"]!,
      symbol: "",
      side,
      size,
      entryPrice: 0,
      markPrice: 0,
      unrealisedPnl: 0,
      leverage: "",
      raw: {},
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

export { router as brokerMT5Router };
