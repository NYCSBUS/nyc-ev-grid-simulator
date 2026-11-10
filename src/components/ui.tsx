import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Status } from '../types';

/**
 * Tooltip. Wrap any element; `text` shows in a fixed-position bubble on hover, and on keyboard focus.
 * `hideOnPress` dismisses it when the wrapped control is clicked (for buttons whose tip would otherwise sit over the page it just opened).
 */
export function Tip({ text, children, hideOnPress = false }: { text: ReactNode; children: ReactNode; hideOnPress?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
  };
  return (
    <span
      className="tt"
      onMouseEnter={(e) => show(e.currentTarget as HTMLElement)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => {
        // keyboard focus only — a mouse click also focuses, and must not re-open the tip
        if ((e.target as HTMLElement).matches(':focus-visible')) show(e.currentTarget as HTMLElement);
      }}
      onBlur={() => setPos(null)}
      onMouseDown={hideOnPress ? () => setPos(null) : undefined}
      onKeyDown={(e) => e.key === 'Escape' && setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <span
            className="tt-body"
            role="tooltip"
            style={{
              left: Math.min(Math.max(8, pos.x - 140), Math.max(8, window.innerWidth - 290)),
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
      <span className="help-dot" tabIndex={0} role="note" aria-label={typeof text === 'string' ? `Help: ${text}` : 'Help'}>
        ?
      </span>
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
  const id = useId();
  return (
    <div className="field">
      <span className="label">
        <label htmlFor={id}>{label}</label>
        {help && <Help text={help} />}
      </span>
      <span className="value">{format(value)}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={(e) => onChange(+e.target.value)} />
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
  const id = useId();
  return (
    <div className="field">
      <span className="label">
        <label htmlFor={id}>{label}</label>
        {help && <Help text={help} />}
      </span>
      <span className="row" style={{ gap: 4 }}>
        <input id={id} type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(+e.target.value)} />
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
  const id = useId();
  // long option text gets its own full-width row instead of being cut off beside the label
  const stack = options.some((o) => o.label.length > 24);
  return (
    <div className={`field ${stack ? 'stack' : ''}`}>
      <span className="label">
        <label htmlFor={id}>{label}</label>
        {help && <Help text={help} />}
      </span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
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
    <span className="check-row">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {help && <Help text={help} />}
    </span>
  );
}

/**
 * Multi-select chips. With `allLabel`, an empty selection means "no filter" and is shown as a lit "All" chip,
 * so an unlit chip always means "not included".
 */
export function Chips<T extends string>({ options, value, onChange, allLabel }: { options: Array<{ value: T; label: string }>; value: T[]; onChange: (v: T[]) => void; allLabel?: string }) {
  return (
    <div className="chips" role="group">
      {allLabel && (
        <button className={`chip ${value.length === 0 ? 'on' : ''}`} aria-pressed={value.length === 0} onClick={() => onChange([])}>
          {allLabel}
        </button>
      )}
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
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

/** One vocabulary everywhere: green = Fits, amber = Tight, red = Doesn't fit. */
export const STATUS_WORD: Record<Status, string> = { ok: 'Fits', warn: 'Tight', crit: "Doesn't fit", unknown: 'No data' };

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return <span className={`pill ${status}`}>{label ?? STATUS_WORD[status]}</span>;
}

export const STATUS_COLOR: Record<Status, string> = { ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444', unknown: '#64748b' };

export const fmt = {
  kw: (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${Math.round(v)} kW`),
  mw: (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)} MW`),
  pct: (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`),
  /** How full something gets: a percentage up to 10×, then a multiple ("25×") — the same number everywhere it appears. */
  fill: (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v >= 10 ? `${Math.round(v)}×` : `${Math.round(v * 100)}%`),
  usd: (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`),
  int: (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString()),
  num: (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d)),
  m: (v: number) => `${Math.round(v)} m`,
};
