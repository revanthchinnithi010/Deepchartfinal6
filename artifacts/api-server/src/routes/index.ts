import { Router, type IRouter } from "express";
import { createHealthRouter } from "./health.js";
import { createWatchlistRouter } from "./watchlist.js";
import alertEventsRouter from "./alert_events.js";
import { createAlertsRouter } from "./alerts.js";
import { createZonesRouter } from "./zones.js";
import { createTrendlinesRouter } from "./trendlines.js";
import { createTelegramRouter } from "./telegram.js";
import { createDeltaRouter } from "./delta.js";
import { createMarketRouter } from "./market.js";
import { createAnalyticsRouter } from "./analytics.js";
import { configRouter } from "./config.js";
import { createCandlesRouter } from "./candles.js";
import { drawingsRouter } from "./drawings.js";
import tradesRouter from "./trades.js";
import statsRouter from "./stats.js";
import notesRouter from "./notes.js";
import calendarEventsRouter from "./calendar_events.js";
import chartLayoutsRouter from "./chart_layouts.js";
import { brokerAccountsRouter } from "./broker_accounts.js";
import { brokerDeltaRouter } from "./broker_delta.js";
import { brokerBybitRouter } from "./broker_bybit.js";
import { brokerMT5Router } from "./broker_mt5.js";
import { brokerConnectionRouter } from "./broker_connection.js";
import { myIpRouter } from "./my_ip.js";
import { backupRouter } from "./backup.js";
import { createSymbolsRouter } from "./symbols.js";
import { createFeedDiagnosticsRouter } from "./feed_diagnostics.js";
import { createCtraderOAuthRouter } from "./ctrader_oauth.js";
import { createCtraderSpotsRouter } from "./ctrader_spots.js";
import { createContractInfoRouter } from "./contract_info.js";
import ctraderStatsRouter from "./ctrader_stats.js";
import { createOrderbookRouter } from "./orderbook.js";
import { marketCalendarRouter } from "./market_calendar.js";
import { createTickerRouter } from "./ticker.js";
import type { AlertEngine } from "../services/AlertEngine.js";
import type { MarketDataService } from "../services/MarketDataService.js";
import type { FeedHealthMonitor } from "../services/FeedHealthMonitor.js";
import type { TelegramService } from "../services/TelegramService.js";
import type { DeltaService } from "../services/DeltaService.js";
import type { WSManager } from "../ws/WSManager.js";
import type { CandleAggregator } from "../services/CandleAggregator.js";

export function createRouter(deps: {
  alertEngine: AlertEngine;
  marketData: MarketDataService;
  healthMonitor: FeedHealthMonitor;
  telegram: TelegramService;
  delta: DeltaService;
  wsManager: WSManager;
  candleAggregator: CandleAggregator;
}): IRouter {
  const router: IRouter = Router();

  router.use(createHealthRouter({
    delta: deps.delta,
    telegram: deps.telegram,
    wsManager: deps.wsManager,
  }));
  router.use(tradesRouter);
  router.use(statsRouter);
  router.use(notesRouter);
  router.use(createWatchlistRouter(deps.marketData));
  router.use(alertEventsRouter);
  router.use(createAlertsRouter(deps.alertEngine));
  router.use(createZonesRouter(deps.alertEngine));
  router.use(createTrendlinesRouter(deps.alertEngine));
  router.use(createTelegramRouter(deps.telegram));
  router.use(createDeltaRouter(deps.delta));
  router.use(createMarketRouter(deps.marketData, deps.healthMonitor));
  router.use(createCandlesRouter(deps.candleAggregator, deps.marketData));
  router.use(createAnalyticsRouter());
  router.use(configRouter);
  router.use(calendarEventsRouter);
  router.use(chartLayoutsRouter);
  router.use(drawingsRouter);
  router.use(brokerAccountsRouter);
  router.use(brokerDeltaRouter);
  router.use(brokerBybitRouter);
  router.use(brokerMT5Router);
  router.use(brokerConnectionRouter);
  router.use(myIpRouter);
  router.use(backupRouter);
  router.use(createSymbolsRouter(deps.marketData));
  router.use(createFeedDiagnosticsRouter(deps.marketData));
  router.use(createCtraderOAuthRouter());
  router.use(createCtraderSpotsRouter());
  router.use(createContractInfoRouter());
  router.use(ctraderStatsRouter);
  router.use(createOrderbookRouter());
  router.use(marketCalendarRouter);
  router.use(createTickerRouter());

  return router;
}
