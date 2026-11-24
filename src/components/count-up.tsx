"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

export function CountUp({ value, duration = 900, suffix = "", money = false }: { value: number; duration?: number; suffix?: string; money?: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    });
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {money ? formatMoney(Math.round(shown * 100) / 100) : Math.floor(shown)}
      {suffix}
    </span>
  );
}
