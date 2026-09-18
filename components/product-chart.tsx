"use client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const COLORS = [
  "#8eb8a7",
  "#b58bb6",
  "#7aa8c9",
  "#c9a76e",
  "#a8c27a",
  "#d48a6b",
  "#6bb5a0",
  "#c47a9e",
  "#7b9ec4",
  "#c4a87a",
];

export default function ProductChart({
  data,
  type,
}: {
  data: { name: string; value: number }[];
  type: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="real-chart" style={{ textAlign: "center", padding: 40, color: "#999" }}>
        No data to display
      </div>
    );
  }

  const maxLabelLen = 18;
  const tickFormatter = (v: string) =>
    v.length > maxLabelLen ? v.slice(0, maxLabelLen - 1) + "..." : v;

  return (
    <div className="real-chart">
      <ResponsiveContainer width="100%" height={380}>
        {type === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis
              dataKey="name"
              tickFormatter={tickFormatter}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              interval={0}
              height={data.length > 6 ? 70 : 40}
            />
            <YAxis />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString(), "Value"]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              maxBarSize={60}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis
              dataKey="name"
              tickFormatter={tickFormatter}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              interval={0}
              height={data.length > 6 ? 70 : 40}
            />
            <YAxis />
            <Tooltip
              formatter={(value) => [Number(value).toLocaleString(), "Value"]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Line
              dataKey="value"
              stroke="#b58bb6"
              strokeWidth={3}
              dot={{ r: 4, fill: "#b58bb6" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
