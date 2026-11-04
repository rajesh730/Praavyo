"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

function parts(ms) {
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  };
}

/**
 * "4d 6h 12m to go" until a program starts; "Today" on the day itself
 * (once the start time has passed); "Finished" after that day.
 * Ticks every 30 seconds.
 */
export default function ProgramCountdown({ date, className = "" }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  let label;
  let tone;
  if (target > now) {
    const { days, hours, minutes } = parts(target - now);
    label = days > 0 ? `${days}d ${hours}h ${minutes}m to go` : `${hours}h ${minutes}m to go`;
    tone = days <= 2 ? "badge-warning" : "badge-brand";
  } else if (now <= endOfDay.getTime()) {
    label = "Today";
    tone = "badge-success";
  } else {
    label = "Finished";
    tone = "badge-neutral";
  }

  return (
    <span className={`badge ${tone} inline-flex items-center gap-1 text-xs ${className}`}>
      <Timer aria-hidden size={13} />
      {label}
    </span>
  );
}
