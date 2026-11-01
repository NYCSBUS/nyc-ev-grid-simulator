import { useEffect, useRef, useState } from 'react';
import { geocode, type GeocodeResult } from '../lib/geocode';
import { useStore } from '../state/store';
import { newSite } from '../state/defaults';

export function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<GeocodeResult | null>(null);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const addSite = useStore((s) => s.addSite);
  const setTab = useStore((s) => s.setTab);
  const abort = useRef<AbortController>();

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        setResults(await geocode(q, abort.current.signal));
        setOpen(true);
      } catch {
        /* aborted */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (r: GeocodeResult) => {
    setOpen(false);
    setQ(r.name);
    setPending(r);
    setTab('map');
    requestFlyTo([r.lng, r.lat], 16.5);
  };

  const simulateHere = () => {
    if (!pending) return;
    const short = pending.name.split(',').slice(0, 1)[0];
    addSite(newSite(pending.lng, pending.lat, { name: short, address: pending.name.replace(', United States', '') }));
    setPending(null);
    setQ('');
  };

  return (
    <div className="search" id="tour-search">
      <span className="icon">⌕</span>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPending(null);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) pick(results[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Type an NYC address to try chargers there…"
      />
      {open && results.length > 0 && (
        <div className="results">
          {results.map((r) => (
            <button key={`${r.lng},${r.lat}`} onMouseDown={() => pick(r)}>
              {r.name.replace(', United States', '')}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="results" style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ flex: 1 }}>
            Simulate new EV load at this address?
          </span>
          <button className="btn primary small" onClick={simulateHere}>
            Put chargers here
          </button>
          <button className="btn small" onClick={() => setPending(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
