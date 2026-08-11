import { memo, useRef } from "react";
import { useChartStore } from "@/store/chartStore";
import { motion } from "motion/react";
import { AnimatedList, AnimatedListItem } from "@/components/animations";

interface TF { label: string; value: string }

const TIMEFRAMES: TF[] = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

interface TimeframeSelectorProps {
  value?: string;
  onChange?: (tf: string) => void;
  compact?: boolean;
  className?: string;
}

export const TimeframeSelector = memo(function TimeframeSelector({
  value: valueProp,
  onChange: onChangeProp,
  compact,
  className,
}: TimeframeSelectorProps) {
  const { interval, setInterval } = useChartStore();
  const active   = valueProp  ?? interval;
  const onChange = onChangeProp ?? setInterval;
  const stripRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (stripRef.current) {
      e.preventDefault();
      stripRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={stripRef}
      className={className}
      onWheel={handleWheel}
      style={{
        display:          "flex",
        alignItems:       "center",
        gap:              2,
        overflowX:        "auto",
        overflowY:        "hidden",
        scrollbarWidth:   "none",
        flexShrink:       1,
        minWidth:         0,
        padding:          "2px 1px",
      }}
    >
      <AnimatedList>
        {TIMEFRAMES.map(tf => {
          const isActive = tf.value === active;
          return (
            <AnimatedListItem key={tf.value}>
              <button
                key={tf.value}
                onClick={() => onChange(tf.value)}
                style={{
                  height:       compact ? 22 : 26,
                  padding:      compact ? "0 7px" : "0 9px",
                  borderRadius: 6,
                  border:       isActive ? "1px solid rgba(183,255,90,0.4)" : "1px solid transparent",
                  background:   isActive ? "rgba(183,255,90,0.12)" : "transparent",
                  cursor:       "pointer",
                  fontSize:     compact ? 10.5 : 11,
                  fontWeight:   isActive ? 800 : 500,
                  color:        isActive ? "#B7FF5A" : "rgba(167,184,169,0.55)",
                  letterSpacing:"0.01em",
                  flexShrink:   0,
                  transition:   "all 0.15s",
                  boxShadow:    isActive ? "0 0 8px rgba(183,255,90,0.14)" : "none",
                  whiteSpace:   "nowrap",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.9)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = "rgba(167,184,169,0.55)";
                  }
                }}
              >
                {tf.label}
              </button>
            </AnimatedListItem>
          );
        })}
      </AnimatedList>
    </div>
  );
});

export default TimeframeSelector;
