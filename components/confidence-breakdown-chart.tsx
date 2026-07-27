"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  value: { label: "Score", color: "#0f1f3d" },
} satisfies ChartConfig;

// Values must already be plain numbers, not Prisma.Decimal — ChartContainer
// is a Client Component, and Decimal instances aren't serializable across
// that boundary (same issue hit and fixed for AssessmentListItem in
// lib/agents/persist.ts).
export function ConfidenceBreakdownChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" domain={[0, 1]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={130}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel formatter={(value) => Number(value).toFixed(2)} />}
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
