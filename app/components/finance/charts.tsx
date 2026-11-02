"use client"

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { CHART_COLORS, CHART_THEME, ChartTooltip, formatTick, getYAxisWidth } from "@/components/chart-utils"

type Row = Record<string, any>
type Series = { key: string; label?: string }

function yWidth(data: Row[], series: Series[]) {
  return Math.max(...series.map((s) => getYAxisWidth(data, s.key)))
}

export function BarSeriesChart({ data, x, series, stacked = false, height = 280, horizontal = false }: {
  data: Row[]; x: string; series: Series[]; stacked?: boolean; height?: number; horizontal?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={CHART_THEME.tick} axisLine={false} tickLine={false} tickFormatter={formatTick} />
            <YAxis type="category" dataKey={x} tick={CHART_THEME.tick} axisLine={false} tickLine={false} width={150} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={CHART_THEME.tick} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_THEME.tick} axisLine={false} tickLine={false} tickFormatter={formatTick} width={yWidth(data, series)} />
          </>
        )}
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} stackId={stacked ? "a" : undefined}
            fill={CHART_COLORS[i % CHART_COLORS.length]} radius={stacked ? 0 : [3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function LineSeriesChart({ data, x, series, height = 280, area = false, yDomain }: {
  data: Row[]; x: string; series: Series[]; height?: number; area?: boolean; yDomain?: [number | "auto", number | "auto"]
}) {
  const Chart = area ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey={x} tick={CHART_THEME.tick} axisLine={false} tickLine={false} />
        <YAxis tick={CHART_THEME.tick} axisLine={false} tickLine={false} tickFormatter={formatTick} width={yWidth(data, series)} domain={yDomain} />
        <Tooltip content={<ChartTooltip />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stackId="a"
              stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.25} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} dot={false} strokeWidth={2}
              stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeDasharray={s.key.toLowerCase().includes("budget") || s.key.toLowerCase().includes("forecast") ? "5 4" : undefined}
              connectNulls={false} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  )
}
