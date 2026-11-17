"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatINR, type DashboardMetrics } from "@voiceretain/shared";
import { formatWeekday } from "@/lib/format";

type Day = DashboardMetrics["last7Days"][number];

/** Revenue won back, per Indian calendar day, today on the right. */
export function RevenueChart({ days }: { days: Day[] }) {
  const data = days.map((d) => ({
    day: formatWeekday(d.date),
    rupees: d.revenueRecoveredPaise / 100,
    paise: d.revenueRecoveredPaise,
  }));
  const any = days.some((d) => d.revenueRecoveredPaise > 0);

  return (
    <div>
      {any ? (
        <div className="h-56 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: "#0f2f36", strokeWidth: 2 }}
                tick={{ fill: "#0f2f36", fontSize: 14 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,47,54,0.06)" }}
                formatter={(_value, _name, item) => [formatINR(item.payload.paise), "Recovered"]}
                labelFormatter={(label) => String(label)}
                contentStyle={{ border: "2px solid #0f2f36", borderRadius: 0, boxShadow: "none" }}
              />
              <Bar dataKey="rupees" isAnimationActive={false}>
                {data.map((_, i) => (
                  <Cell key={i} fill={i === data.length - 1 ? "#0f2f36" : "#f5a800"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-ink-soft py-8">Nothing recovered in the last 7 days.</p>
      )}

      <table className="sr-only">
        <caption>Revenue recovered, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Recovered</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatWeekday(d.date)}</th>
              <td>{formatINR(d.revenueRecoveredPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
