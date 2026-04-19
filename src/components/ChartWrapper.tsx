'use client';

import { useRef, useState, useEffect, ReactNode } from 'react';

interface ChartWrapperProps {
  height: number;
  className?: string;
  children: (width: number, height: number) => ReactNode;
}

/**
 * Replaces ResponsiveContainer for all Recharts charts.
 * Measures real pixel width after mount via ResizeObserver, then
 * passes explicit (width, height) to the chart via render-prop children.
 * Avoids the "width(-1) height(-1)" warning that occurs when charts render
 * inside accordion/tab containers before layout is complete.
 */
export default function ChartWrapper({ height, className, children }: ChartWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    function measure() {
      if (ref.current) {
        const w = ref.current.getBoundingClientRect().width;
        if (w > 0) setWidth(Math.floor(w));
      }
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height, overflow: 'hidden' }} className={className}>
      {children(width, height)}
    </div>
  );
}
