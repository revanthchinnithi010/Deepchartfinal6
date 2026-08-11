import { Router } from "express";
import { getBrokerAdapter } from "../brokers/BrokerService.js";

const router = Router();

router.get("/broker/bybit/balance", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  try {
    const balances = await ctx.adapter.getBalance();
    const usdt = balances.find(b => b.coin === "USDT") ?? balances[0];
    res.json({ ok: true, balance: usdt, all: balances });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.get("/broker/bybit/positions", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  try {
    const positions = await ctx.adapter.getPositions();
    res.json({ ok: true, positions });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.get("/broker/bybit/orders", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  try {
    const orders = await ctx.adapter.getOrders();
    res.json({ ok: true, orders });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.post("/broker/bybit/order", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  try {
    const result = await ctx.adapter.placeOrder(req.body);
    res.json({ ok: true, orderId: result.orderId });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.delete("/broker/bybit/order/:orderId", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  const { category, symbol } = req.body as { category?: string; symbol?: string };
  try {
    await ctx.adapter.cancelOrder(req.params["orderId"]!, {
      category: category ?? "linear",
      symbol: symbol ?? "",
    });
    res.json({ ok: true });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.delete("/broker/bybit/position", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "bybit") { res.status(400).json({ ok: false, error: "Account is not a Bybit account" }); return; }
  const { category, symbol, side, qty } = req.body as { category?: string; symbol: string; side: "Long" | "Short"; qty: string };
  try {
    await ctx.adapter.closePosition({
      id: symbol, symbol, side, size: parseFloat(qty),
      entryPrice: 0, markPrice: 0, unrealisedPnl: 0, leverage: "",
      raw: { category: category ?? "linear" },
    });
    res.json({ ok: true });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

export { router as brokerBybitRouter };
