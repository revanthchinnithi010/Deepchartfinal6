import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import { fetchDealHistory, fetchSingleSymbolSpec, type CtraderDeal } from "../lib/ctraderProtoOA.js";
import { logger } from "../lib/logger.js";

/**
 * Real cTrader Trade Statistics — computed from actual closed-deal history
 * (ProtoOADealListReq), never from the manual journal `trades` table and
 * never fabricated. If no account is connected, or the deal fetch fails,
 * the endpoint returns an explicit unavailable state — no placeholder numbers.
 */

const router: IRouter = Router();

interface ClosedTradeLeg {
  positionId:  number;
  side:        "BUY" | "SELL";
  volumeLots:  number;
  entryPrice:  number;
  exitPrice:   number;
  netProfit:   number; // grossProfit + swap + commission (already signed)
  entryTimeMs: number | null;
  exitTimeMs:  number;
}

async function getCtraderAuth() {
  const [tokRow, cfgRow] = await Promise.all([
    pool.query<{ access_token_enc: string }>(
      "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
    ),
    pool.query<{ account_id: number; is_live: boolean }>(
      "SELECT account_id, is_live FROM ctrader_spot_config WHERE id=1",
    ),
  ]);
  if (!tokRow.rows.length || !cfgRow.rows.length) return null;

  const accessToken = decrypt(tokRow.rows[0].access_token_enc);
  const clientId     = process.env["CTRADER_CLIENT_ID"];
  const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
  if (!accessToken || !clientId || !clientSecret) return null;

  return {
    ctidTraderAccountId: cfgRow.rows[0].account_id,
    isLive:              Boolean(cfgRow.rows[0].is_live),
    accessToken,
    clientId,
    clientSecret,
  };
}

function buildClosedLegs(deals: CtraderDeal[]): ClosedTradeLeg[] {
  const openTimeByPosition = new Map<number, number>();
  for (const d of deals) {
    if (!d.isClose) {
      const prev = openTimeByPosition.get(d.positionId);
      if (prev === undefined || d.executionTimestamp < prev) {
        openTimeByPosition.set(d.positionId, d.executionTimestamp);
      }
    }
  }

  const legs: ClosedTradeLeg[] = [];
  for (const d of deals) {
    if (!d.isClose || d.closeGrossProfit === null) continue;
    const netProfit = d.closeGrossProfit + (d.closeSwap ?? 0) + (d.closeCommission ?? 0);
    legs.push({
      positionId:  d.positionId,
      side:        d.tradeSide,
      volumeLots:  d.closedVolume ?? d.volume,
      entryPrice:  d.executionPrice,
      exitPrice:   d.executionPrice,
      netProfit,
      entryTimeMs: openTimeByPosition.get(d.positionId) ?? null,
      exitTimeMs:  d.executionTimestamp,
    });
  }
  return legs;
}

router.get("/ctrader/stats/:symbol", async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  const daysBack = Math.min(Math.max(parseInt(String(req.query.days ?? "90"), 10) || 90, 1), 365);

  const auth = await getCtraderAuth();
  if (!auth) {
    res.json({
      available: false,
      reason: "No cTrader account connected. Connect a cTrader account to see real trade statistics.",
      symbol,
    });
    return;
  }

  try {
    const symRow = await pool.query<{ symbol_id: number; pip_position: number; digits: number }>(
      "SELECT symbol_id, pip_position, digits FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
      [symbol],
    );
    if (!symRow.rows.length) {
      res.json({
        available: false,
        reason: `Symbol ${symbol} not found in the synced cTrader symbol catalog yet.`,
        symbol,
      });
      return;
    }
    const { symbol_id: symbolId, pip_position: pipPosition } = symRow.rows[0];

    const toMs   = Date.now();
    const fromMs = toMs - daysBack * 86400 * 1000;

    const [dealResult, specResult] = await Promise.allSettled([
      fetchDealHistory({ ...auth, fromMs, toMs, maxRows: 1000 }),
      fetchSingleSymbolSpec({ ...auth, symbolId }),
    ]);

    if (dealResult.status === "rejected" || !dealResult.value.ok) {
      const err = dealResult.status === "rejected" ? String(dealResult.reason) : dealResult.value.error;
      res.json({ available: false, reason: `Could not fetch deal history: ${err}`, symbol });
      return;
    }

    const symbolDeals = dealResult.value.deals.filter(d => d.symbolId === symbolId);
    const legs = buildClosedLegs(symbolDeals);

    if (legs.length === 0) {
      res.json({
        available: true,
        symbol,
        periodDays: daysBack,
        totalTrades: 0,
        note: `No closed trades on ${symbol} in the last ${daysBack} days for this account.`,
      });
      return;
    }

    const wins   = legs.filter(l => l.netProfit > 0);
    const losses = legs.filter(l => l.netProfit < 0);

    const netProfit    = legs.reduce((s, l) => s + l.netProfit, 0);
    const grossWin     = wins.reduce((s, l) => s + l.netProfit, 0);
    const grossLoss    = Math.abs(losses.reduce((s, l) => s + l.netProfit, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? null : 0);
    const avgTrade      = netProfit / legs.length;
    const tradedVolume  = legs.reduce((s, l) => s + l.volumeLots, 0);

    const durations = legs
      .filter(l => l.entryTimeMs !== null)
      .map(l => l.exitTimeMs - (l.entryTimeMs as number));
    const avgDurationMs = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null;

    let totalPips: number | null = null;
    if (specResult.status === "fulfilled") {
      const digits  = specResult.value.digits ?? symRow.rows[0].digits;
      const pipPos  = specResult.value.pipPosition ?? pipPosition;
      if (digits !== null && pipPos !== null) {
        const pipSize = 1 / Math.pow(10, digits - pipPos);
        totalPips = legs.reduce((sum, l) => {
          // priceDiff sign depends on side: for BUY closing (i.e. was long), profit means exit>entry
          const sign = l.side === "SELL" ? -1 : 1; // closing side SELL implies original was BUY(long)
          const diff = (l.exitPrice - l.entryPrice) * sign;
          return sum + diff / pipSize;
        }, 0);
      }
    }

    res.json({
      available:      true,
      symbol,
      periodDays:     daysBack,
      netProfit:      Math.round(netProfit * 100) / 100,
      profitFactor:   profitFactor !== null ? Math.round(profitFactor * 100) / 100 : null,
      totalTrades:    legs.length,
      winTrades:      wins.length,
      lossTrades:     losses.length,
      winRate:        Math.round((wins.length / legs.length) * 10000) / 100,
      avgTrade:       Math.round(avgTrade * 100) / 100,
      avgDurationMs,
      totalPips:      totalPips !== null ? Math.round(totalPips * 10) / 10 : null,
      tradedVolumeLots: Math.round(tradedVolume * 100) / 100,
      note: totalPips === null
        ? "Total Pips unavailable — could not resolve pip size for this symbol."
        : undefined,
    });
  } catch (err) {
    logger.warn({ symbol, err: String(err) }, "ctrader/stats: fetch failed");
    res.json({ available: false, reason: `Unexpected error: ${String(err)}`, symbol });
  }
});

export default router;
