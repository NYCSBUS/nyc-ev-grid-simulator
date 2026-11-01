import { useState } from 'react';
import { useStore } from '../state/store';
import { shareUrl, decodeScenario, encodeScenario } from '../state/url';
import { nameplateKw } from '../sim/model';
import { Help, fmt } from './ui';

export function SavedPanel() {
  const scenario = useStore((s) => s.scenario);
  const saved = useStore((s) => s.saved);
  const compareId = useStore((s) => s.compareId);
  const { saveScenario, loadScenario, deleteScenario, newScenario, resetToDefault, setCompare, importScenario, setToast, setTab } = useStore();
  const [importText, setImportText] = useState('');

  const copyShare = async () => {
    const url = shareUrl(scenario);
    try {
      await navigator.clipboard.writeText(url);
      setToast('Share link copied to clipboard');
    } catch {
      prompt('Copy this link', url);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scenario.name.replace(/\s+/g, '_')}.json`;
    a.click();
  };

  const doImport = () => {
    const txt = importText.trim();
    let s = null;
    try {
      s = txt.startsWith('{') ? JSON.parse(txt) : decodeScenario(txt.includes('s=') ? txt.split('s=')[1] : txt);
    } catch {
      s = null;
    }
    if (s && Array.isArray(s.sites)) {
      importScenario(s);
      setImportText('');
      setToast('Scenario imported');
    } else setToast('Could not parse scenario');
  };

  return (
    <div className="panel" id="tour-saved">
      <h2>Scenarios</h2>
      <p className="muted">
        Current: <b>{scenario.name}</b> · {scenario.sites.length} sites · {fmt.kw(scenario.sites.reduce((s, x) => s + nameplateKw(x), 0))}
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" onClick={() => saveScenario()}>
          Save
        </button>
        <button className="btn" onClick={newScenario}>
          Duplicate
        </button>
        <button className="btn" onClick={copyShare} id="tour-share">
          Copy share link
        </button>
        <button className="btn" onClick={exportJson}>
          Export JSON
        </button>
        <button className="btn danger" onClick={resetToDefault}>
          Reset to baseline
        </button>
      </div>

      <h3>
        Saved scenarios <Help text="Kept in this browser only. Pick one as the comparison to see it side by side with your current work in Analytics." />
      </h3>
      {!saved.length && <div className="muted">Nothing saved yet.</div>}
      {saved
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((s) => (
          <div key={s.id} className={`site-card ${compareId === s.id ? 'selected' : ''}`}>
            <div className="title">
              <span>{s.name}</span>
              <span className="row" style={{ gap: 4 }}>
                <button className="btn small" onClick={() => loadScenario(s.id)}>
                  Load
                </button>
                <button
                  className={`btn small ${compareId === s.id ? 'active' : ''}`}
                  onClick={() => {
                    setCompare(compareId === s.id ? null : s.id);
                    if (compareId !== s.id) setTab('analytics');
                  }}
                >
                  {compareId === s.id ? 'Comparing' : 'Compare'}
                </button>
                <button className="btn small danger" onClick={() => deleteScenario(s.id)}>
                  ×
                </button>
              </span>
            </div>
            <div className="meta">
              {s.sites.length} sites · {fmt.kw(s.sites.reduce((a, x) => a + nameplateKw(x), 0))} · area {s.area.enabled ? `${s.area.year} ${s.area.curve}` : 'off'} · saved {new Date(s.createdAt).toLocaleString()}
            </div>
          </div>
        ))}

      <h3>Import</h3>
      <textarea
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        placeholder="Paste a share link or exported JSON"
        style={{ width: '100%', minHeight: 70, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'inherit', padding: 6 }}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={doImport} disabled={!importText.trim()}>
          Import
        </button>
        <span className="muted" style={{ fontSize: 11 }}>
          Link length: {encodeScenario(scenario).length} chars
        </span>
      </div>
    </div>
  );
}
