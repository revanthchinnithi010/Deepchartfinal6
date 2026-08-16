import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import CustomChartBase from "./CustomChartBase";
import CompressedTimeAxisOverlay from "./CompressedTimeAxisOverlay";
import { useChartStore } from "@/store/chartStore";

type CustomChartProps = ComponentProps<typeof CustomChartBase>;

const STALE_AFTER_MS = 5 * 60 * 1000;

export default function CustomChart(props: CustomChartProps) {
  const { children, interval, ...rest } = props;
  const barsLoaded = useChartStore((s) => s.barsLoaded);
  const setBarsLoaded = useChartStore((s) => s.setBarsLoaded);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const markFreshLoad = () => {
      setBarsLoaded(false);
      window.dispatchEvent(new Event("tj:chart-refresh"));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenFor = hiddenAtRef.current == null
        ? Number.POSITIVE_INFINITY
        : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;

      // Only show the loading screen after a genuinely stale background
      // period. Short tab/app switches stay instant; a long pause gets a
      // fresh authoritative candle request before the chart is shown again.
      if (hiddenFor >= STALE_AFTER_MS) markFreshLoad();
    };

    const onPageShow = () => {
      const hiddenFor = hiddenAtRef.current == null
        ? Number.POSITIVE_INFINITY
        : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenFor >= STALE_AFTER_MS) markFreshLoad();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [setBarsLoaded]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <CustomChartBase {...rest} interval={interval}>
        <CompressedTimeAxisOverlay interval={interval ?? "1"} />
        {children as ReactNode}
      </CustomChartBase>

      {!barsLoaded && (
        <div
          aria-label="Loading chart"
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000000",
            pointerEvents: "auto",
          }}
        >
          <style>{`
            .deep-chart-loader {
              --color-1: #fff;
              --size: 1px;
              width: calc(48 * var(--size));
              height: calc(48 * var(--size));
              border-radius: 50%;
              position: relative;
              animation: deep-chart-loader-rotate 1s linear infinite;
            }
            .deep-chart-loader::before {
              content: '';
              box-sizing: border-box;
              position: absolute;
              inset: 0;
              border-radius: 50%;
              border: calc(5 * var(--size)) solid var(--color-1);
              animation: deep-chart-loader-clip 2s linear infinite;
            }
            @keyframes deep-chart-loader-rotate {
              100% { transform: rotate(360deg); }
            }
            @keyframes deep-chart-loader-clip {
              0% { clip-path: polygon(50% 50%, 0 0, 0 0, 0 0, 0 0, 0 0); }
              25% { clip-path: polygon(50% 50%, 0 0, 100% 0, 100% 0, 100% 0, 100% 0); }
              50% { clip-path: polygon(50% 50%, 0 0, 100% 0, 100% 100%, 100% 100%, 100% 100%); }
              75% { clip-path: polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%, 0 100%); }
              100% { clip-path: polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%, 0 0); }
            }
          `}</style>
          <span className="deep-chart-loader" />
        </div>
      )}
    </div>
  );
}
