import { CtraderWidget } from "@/components/charts/CtraderWidget";

export default function CtraderTestPage() {
  return (
    <div style={{
      minHeight: "100%", padding: "24px 20px 40px",
      maxWidth: 820, margin: "0 auto",
    }}>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(183,255,90,0.09)", border: "1px solid rgba(183,255,90,0.18)",
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>🔌</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>
            cTrader Connection
          </h1>
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
            OAuth 2.0 flow — connect your cTrader account to enable live market data
          </p>
        </div>
      </div>
      <CtraderWidget />
    </div>
  );
}
