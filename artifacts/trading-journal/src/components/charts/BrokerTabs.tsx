import { memo } from "react";
import { useMarketStore, type BrokerName } from "@/store/marketStore";

interface BrokerTabsProps {
  className?: string;
}

const BROKERS: { id: BrokerName; label: string; shortLabel: string; color: string; glow: string }[] = [
  {
    id:         "delta",
    label:      "Delta Exchange",
    shortLabel: "Delta",
    color:      "#00BFFF",
    glow:       "rgba(0,191,255,0.18)",
  },
];

export const BrokerTabs = memo(function BrokerTabs({ className }: BrokerTabsProps) {
  const { activeBroker, setActiveBroker } = useMarketStore();

  return (
    <div
      className={className}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            3,
        padding:        "3px",
        borderRadius:   10,
        background:     "rgba(255,255,255,0.04)",
        border:         "1px solid rgba(255,255,255,0.07)",
        flexShrink:     0,
      }}
    >
      {BROKERS.map(b => {
        const active = activeBroker === b.id;
        return (
          <button
            key={b.id}
            onClick={() => setActiveBroker(b.id)}
            title={b.label}
            style={{
              height:         26,
              padding:        "0 10px",
              borderRadius:   7,
              border:         active ? `1px solid ${b.color}44` : "1px solid transparent",
              background:     active ? `${b.glow}` : "transparent",
              cursor:         "pointer",
              fontSize:       11,
              fontWeight:     active ? 800 : 500,
              color:          active ? b.color : "rgba(167,184,169,0.55)",
              letterSpacing:  "0.01em",
              transition:     "all 0.18s",
              whiteSpace:     "nowrap",
              boxShadow:      active ? `0 0 10px ${b.glow}` : "none",
            }}
            onMouseEnter={e => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.9)";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.55)";
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }
            }}
          >
            <span className="hidden sm:inline">{b.label}</span>
            <span className="inline sm:hidden">{b.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
});

export default BrokerTabs;
