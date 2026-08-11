import { memo } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import areaLabLogoDarkUrl from "@/assets/area-lab-logo.svg?url";
import areaLabLogoLightUrl from "@/assets/area-lab-logo-light.svg?url";

const LOGO_ASPECT_RATIO = 524 / 102;

interface AreaLabLogoProps {
  height?: number;
  className?: string;
}

export const AreaLabLogo = memo(function AreaLabLogo({ height = 32, className }: AreaLabLogoProps) {
  const { theme } = useTheme();
  const src = theme === "light" ? areaLabLogoLightUrl : areaLabLogoDarkUrl;

  return (
    <img
      src={src}
      alt="Area.lab"
      className={className}
      draggable={false}
      style={{
        height,
        width: height * LOGO_ASPECT_RATIO,
        objectFit: "contain",
        display: "block",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
});
