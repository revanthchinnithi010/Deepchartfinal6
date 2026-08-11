export type BrokerName = "Delta Exchange" | "FusionMarkets" | "Groww";
export type TradeDirection = "long" | "short";
export type TradeStatus = "win" | "loss";

export interface SyncedTrade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entry: number;
  exit: number;
  pnl: number;
  fees: number;
  broker: BrokerName;
  time: string;
  status: TradeStatus;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  tradesImported: number;
  status: "success" | "error";
  message: string;
}

export interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  fileName: string;
  tradesImported: number;
  status: "success" | "error";
  message: string;
}

export const DELTA_SYNC_HISTORY: SyncHistoryEntry[] = [
  { id: "1", timestamp: "2026-05-23T10:30:00Z", tradesImported: 12, status: "success", message: "12 new trades synced successfully" },
  { id: "2", timestamp: "2026-05-23T08:00:00Z", tradesImported: 3, status: "success", message: "3 new trades synced successfully" },
  { id: "3", timestamp: "2026-05-22T18:45:00Z", tradesImported: 0, status: "error", message: "API rate limit exceeded, retry in 15 min" },
  { id: "4", timestamp: "2026-05-22T10:00:00Z", tradesImported: 7, status: "success", message: "7 new trades synced successfully" },
  { id: "5", timestamp: "2026-05-21T16:30:00Z", tradesImported: 5, status: "success", message: "5 new trades synced successfully" },
  { id: "6", timestamp: "2026-05-21T09:00:00Z", tradesImported: 9, status: "success", message: "9 new trades synced successfully" },
];

export const FUSION_IMPORT_HISTORY: ImportHistoryEntry[] = [
  { id: "1", timestamp: "2026-05-23T09:45:00Z", fileName: "FusionMarkets_Trades_May23.csv", tradesImported: 6, status: "success", message: "6 trades imported" },
  { id: "2", timestamp: "2026-05-22T11:00:00Z", fileName: "FusionMarkets_Trades_May22.csv", tradesImported: 4, status: "success", message: "4 trades imported" },
  { id: "3", timestamp: "2026-05-21T14:30:00Z", fileName: "FusionMarkets_Report_May21.csv", tradesImported: 0, status: "error", message: "Invalid CSV format, missing columns" },
  { id: "4", timestamp: "2026-05-20T09:15:00Z", fileName: "FusionMarkets_Trades_May20.csv", tradesImported: 3, status: "success", message: "3 trades imported" },
];

export const GROWW_IMPORT_HISTORY: ImportHistoryEntry[] = [
  { id: "1", timestamp: "2026-05-23T07:30:00Z", fileName: "Groww_P&L_May_2026.csv", tradesImported: 4, status: "success", message: "4 trades imported" },
  { id: "2", timestamp: "2026-05-20T16:00:00Z", fileName: "Groww_Portfolio_May.csv", tradesImported: 2, status: "success", message: "2 trades imported" },
];

export const SAMPLE_SYNCED_TRADES: SyncedTrade[] = [
  // --- Delta Exchange ---
  { id: "s1",  symbol: "NAS100",   direction: "long",  entry: 18245.50, exit: 18490.00, pnl:  489.00, fees: 12.50, broker: "Delta Exchange", time: "2026-05-23T09:15:00Z", status: "win"  },
  { id: "s2",  symbol: "NAS100",   direction: "short", entry: 18650.00, exit: 18520.00, pnl:  260.00, fees: 12.50, broker: "Delta Exchange", time: "2026-05-22T14:30:00Z", status: "win"  },
  { id: "s3",  symbol: "US30",     direction: "long",  entry: 39250.00, exit: 39680.00, pnl:  860.00, fees: 15.00, broker: "Delta Exchange", time: "2026-05-22T10:45:00Z", status: "win"  },
  { id: "s4",  symbol: "US30",     direction: "short", entry: 39800.00, exit: 40050.00, pnl: -500.00, fees: 15.00, broker: "Delta Exchange", time: "2026-05-21T15:20:00Z", status: "loss" },
  { id: "s5",  symbol: "XAUUSD",   direction: "long",  entry:  2318.50, exit:  2345.80, pnl:  546.00, fees:  8.00, broker: "Delta Exchange", time: "2026-05-23T07:30:00Z", status: "win"  },
  { id: "s6",  symbol: "XAUUSD",   direction: "short", entry:  2360.00, exit:  2341.50, pnl:  370.00, fees:  8.00, broker: "Delta Exchange", time: "2026-05-21T11:00:00Z", status: "win"  },
  { id: "s7",  symbol: "BTCUSD",   direction: "long",  entry: 67250.00, exit: 69100.00, pnl: 1850.00, fees: 25.00, broker: "Delta Exchange", time: "2026-05-22T16:00:00Z", status: "win"  },
  { id: "s8",  symbol: "BTCUSD",   direction: "short", entry: 68500.00, exit: 69200.00, pnl: -700.00, fees: 25.00, broker: "Delta Exchange", time: "2026-05-20T09:30:00Z", status: "loss" },
  { id: "s9",  symbol: "ETHUSD",   direction: "long",  entry:  3145.00, exit:  3280.00, pnl:  675.00, fees: 10.00, broker: "Delta Exchange", time: "2026-05-21T13:45:00Z", status: "win"  },
  { id: "s10", symbol: "ETHUSD",   direction: "short", entry:  3350.00, exit:  3290.00, pnl:  300.00, fees: 10.00, broker: "Delta Exchange", time: "2026-05-20T17:00:00Z", status: "win"  },
  // --- FusionMarkets ---
  { id: "s11", symbol: "EURUSD",   direction: "long",  entry:    1.0845, exit:    1.0912, pnl:  335.00, fees:  5.00, broker: "FusionMarkets", time: "2026-05-23T08:00:00Z", status: "win"  },
  { id: "s12", symbol: "EURUSD",   direction: "short", entry:    1.0960, exit:    1.1010, pnl: -250.00, fees:  5.00, broker: "FusionMarkets", time: "2026-05-22T12:30:00Z", status: "loss" },
  { id: "s13", symbol: "Crude Oil",direction: "long",  entry:    79.45, exit:    82.30, pnl:  570.00, fees:  6.00, broker: "FusionMarkets", time: "2026-05-22T09:15:00Z", status: "win"  },
  { id: "s14", symbol: "Crude Oil",direction: "short", entry:    83.10, exit:    80.90, pnl:  440.00, fees:  6.00, broker: "FusionMarkets", time: "2026-05-20T14:00:00Z", status: "win"  },
  { id: "s15", symbol: "SOLUSD",   direction: "long",  entry:   148.20, exit:   161.50, pnl:  665.00, fees:  8.00, broker: "FusionMarkets", time: "2026-05-21T10:30:00Z", status: "win"  },
  { id: "s16", symbol: "SOLUSD",   direction: "short", entry:   172.40, exit:   178.10, pnl: -285.00, fees:  8.00, broker: "FusionMarkets", time: "2026-05-19T15:45:00Z", status: "loss" },
  // --- Groww ---
  { id: "s17", symbol: "DOGEUSD",  direction: "long",  entry:   0.1620, exit:   0.1785, pnl:  825.00, fees:  3.00, broker: "Groww", time: "2026-05-22T11:00:00Z", status: "win"  },
  { id: "s18", symbol: "DOGEUSD",  direction: "short", entry:   0.1930, exit:   0.1860, pnl:  350.00, fees:  3.00, broker: "Groww", time: "2026-05-20T16:30:00Z", status: "win"  },
  { id: "s19", symbol: "PEPEUSD",  direction: "long",  entry: 0.0000090, exit: 0.0000115, pnl: 1388.00, fees:  2.00, broker: "Groww", time: "2026-05-21T09:00:00Z", status: "win"  },
  { id: "s20", symbol: "PEPEUSD",  direction: "short", entry: 0.0000125, exit: 0.0000138, pnl: -520.00, fees:  2.00, broker: "Groww", time: "2026-05-19T14:00:00Z", status: "loss" },
];
