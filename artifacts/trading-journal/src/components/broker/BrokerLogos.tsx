import { BrokerId, BROKERS } from "@/types/broker";

interface BrokerLogoProps {
  brokerId: BrokerId;
  size?: number;
  className?: string;
}

export function BrokerLogo({ brokerId, size = 32, className }: BrokerLogoProps) {
  const broker = BROKERS.find((b) => b.id === brokerId);
  if (!broker) return null;

  const style = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  // Delta and cTrader icons are rendered in black & white (monochrome).
  const mono = broker.id === "delta" || broker.id === "ctrader";

  if (broker.image) {
    return (
      <img
        src={broker.image}
        alt={broker.name}
        style={{
          ...style,
          ...(mono ? { filter: "grayscale(1) brightness(1.6)" } : {}),
        }}
        className={className}
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent) {
            const bg = mono ? "rgba(255,255,255,0.12)" : broker.color;
            const fallback = document.createElement("div");
            fallback.style.cssText = `width:${size}px;height:${size}px;border-radius:6px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.38)}px;color:#fff;flex-shrink:0;`;
            fallback.textContent = broker.logo;
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...style,
        borderRadius: Math.round(size * 0.2),
        background: mono ? "rgba(255,255,255,0.12)" : broker.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        color: "#fff",
        flexShrink: 0,
      }}
      className={className}
    >
      {broker.logo}
    </div>
  );
}
