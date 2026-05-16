"use client";

import type { GrowthDashboardPayload } from "@/lib/analytics-dashboard-mock";
import type { LabeledCount } from "@/lib/analytics-dashboard-mock";

const ACCENT = "#FF3B30";
const MUTED = "rgba(161, 161, 170, 0.95)";
const GRID = "rgba(39, 39, 42, 0.75)";

export const hubLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: {
      display: true,
      position: "top" as const,
      labels: { color: MUTED, boxWidth: 10, font: { size: 10 } },
    },
    tooltip: {
      backgroundColor: "rgba(9, 9, 11, 0.94)",
      titleColor: "#fafafa",
      bodyColor: "#e4e4e7",
      borderColor: GRID,
      borderWidth: 1,
    },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: MUTED, maxRotation: 45 } },
    y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: MUTED } },
  },
};

export function growthActivityChartData(payload: GrowthDashboardPayload) {
  const labels = payload.signUpsOverTime.map((r) => r.label);
  return {
    labels,
    datasets: [
      {
        label: "Sign-ups",
        data: payload.signUpsOverTime.map((r) => r.value),
        borderColor: ACCENT,
        backgroundColor: "rgba(255, 59, 48, 0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 2,
      },
      {
        label: "Workouts",
        data: payload.workoutsOverTime.map((r) => r.value),
        borderColor: "#e4e4e7",
        backgroundColor: "rgba(228, 228, 231, 0.06)",
        fill: true,
        tension: 0.35,
        pointRadius: 2,
      },
    ],
  };
}

export function barChartData(series: LabeledCount[], color = ACCENT) {
  return {
    labels: series.map((r) => r.label),
    datasets: [
      {
        label: "Users",
        data: series.map((r) => r.value),
        backgroundColor: color,
        borderRadius: 4,
      },
    ],
  };
}

export const hubBarOptions = {
  indexAxis: "y" as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, grid: { color: GRID }, ticks: { color: MUTED } },
    y: { grid: { display: false }, ticks: { color: MUTED } },
  },
};
