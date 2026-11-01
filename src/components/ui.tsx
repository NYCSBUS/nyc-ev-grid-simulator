import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Status } from '../types';

/** Hover tooltip. Wrap any element; `text` shows in a fixed-position bubble. */
export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="tt"
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <span
            className="tt-body"
            style={{
              left: Math.min(Math.max(8, pos.x - 140), window.innerWidth - 290),
              top: pos.y > window.innerHeight - 120 ? pos.y - 110 : pos.y,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function Help({ text }: { text: ReactNode }) {
  return (
    <Tip text={text}>
      <span className="help-dot">?</span>
    </Tip>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  help?: ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {help && <Help text={help} />}
      </label>
      <span className="value">{format(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  help,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  help?: ReactNode;
  suffix?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {help && <Help text={help} />}
      </label>
      <span className="row" style={{ gap: 4 }}>
        <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(+e.target.value)} />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  help?: ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {help && <Help text={help} />}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Check({ label, checked, onChange, help }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {help && <Help text={help} />}
    </label>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({ status }: { status: Status }) {
  return <span className={`status ${status}`} />;
}

export function StatusPill({ status }: { status: Status }) {
  const label: Record<Status, string> = { ok: 'OK', warn: 'Watch', crit: 'Critical', unknown: 'No data' };
  return <span className={`pill ${status}`}>{label[status]}</span>;
}

export const STATUS_COLOR: Record<Status, string> = { ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444', unknown: '#64748b' };

export const fmt = {
  kw: (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${Math.round(v)} kW`),
  mw: (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)} MW`),
  pct: (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`),
  usd: (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`),
  int: (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString()),
  num: (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d)),
  m: (v: number) => `${Math.round(v)} m`,
};
