import type { ComponentProps, ReactNode } from "react";
import CustomChartBase from "./CustomChartBase";
import CompressedTimeAxisOverlay from "./CompressedTimeAxisOverlay";

type CustomChartProps = ComponentProps<typeof CustomChartBase>;

export default function CustomChart(props: CustomChartProps) {
  const { children, interval, ...rest } = props;
  return (
    <CustomChartBase {...rest} interval={interval}>
      <CompressedTimeAxisOverlay interval={interval ?? "1"} />
      {children as ReactNode}
    </CustomChartBase>
  );
}
