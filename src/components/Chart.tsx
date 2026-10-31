import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export function Chart({ option, height = 260, onReady }: { option: echarts.EChartsOption; height?: number; onReady?: (c: echarts.ECharts) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts>();
  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, 'dark', { renderer: 'canvas' });
    onReady?.(chart.current);
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chart.current?.setOption({ backgroundColor: 'transparent', textStyle: { fontFamily: 'Inter, system-ui, sans-serif' }, ...option }, true);
  }, [option]);
  return <div ref={ref} style={{ height, width: '100%' }} />;
}

export function downloadPng(c: echarts.ECharts | undefined, name: string) {
  if (!c) return;
  const a = document.createElement('a');
  a.href = c.getDataURL({ pixelRatio: 2, backgroundColor: '#171d25' });
  a.download = `${name}.png`;
  a.click();
}

export function downloadCsv(rows: Array<Record<string, unknown>>, name: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name}.csv`;
  a.click();
}
