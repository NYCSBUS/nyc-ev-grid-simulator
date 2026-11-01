import { useEffect } from 'react';
import { useStore, type Tab } from './state/store';
import { useLiveData, useStaticData, useToastAutoClear } from './state/hooks';
import { MapView } from './components/MapView';
import { ScenarioPanel, OutlookPanel } from './components/ScenarioPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { MissionsPanel, useMissionTracker } from './components/MissionsPanel';
import { SavedPanel } from './components/SavedPanel';
import { AnalyticsTab } from './components/AnalyticsTab';
import { HelpTab } from './components/HelpTab';
import { SearchBox } from './components/SearchBox';
import { useTour } from './components/Tour';
import { MISSIONS } from './sim/missions';
import { Tip } from './components/ui';

const TABS: Array<{ id: Tab; label: string; tip: string }> = [
  { id: 'sites', label: 'Sites', tip: 'Place charging sites and see the traffic lights on nearby grid equipment' },
  { id: 'outlook', label: 'Outlook', tip: 'Borough-wide EV growth by year: where the grid fills up first' },
  { id: 'results', label: 'Results', tip: 'Charts, tables, costs — and side-by-side comparison' },
  { id: 'scenarios', label: 'Scenarios', tip: 'Save, load, share and import scenarios' },
  { id: 'settings', label: 'Settings', tip: 'The knobs behind the maths and the price assumptions' },
  { id: 'learn', label: 'Learn', tip: 'Illustrated guide, jargon decoder and practice missions' },
];

function LearnTab() {
  const view = useStore((s) => s.learnView);
  const setView = useStore((s) => s.setLearnView);
  const done = useStore((s) => s.missionsDone);
  return (
    <div className="learn">
      <div className="subtabs">
        <button className={`tab ${view === 'guide' ? 'active' : ''}`} onClick={() => setView('guide')}>
          Guide
        </button>
        <button id="tour-missions-subtab" className={`tab ${view === 'missions' ? 'active' : ''}`} onClick={() => setView('missions')}>
          Missions · {done.length}/{MISSIONS.length}
        </button>
      </div>
      {view === 'guide' ? (
        <HelpTab />
      ) : (
        <div className="page-col">
          <MissionsPanel />
        </div>
      )}
    </div>
  );
}

export default function App() {
  useStaticData();
  useLiveData();
  useMissionTracker();
  useTour();
  useToastAutoClear();

  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const toast = useStore((s) => s.toast);
  const missionsDone = useStore((s) => s.missionsDone);
  const requestTour = useStore((s) => s.requestTour);

  const mapTab = tab === 'sites' || tab === 'outlook';

  // First paint: land on the first site so the grid equipment is visible straight away (unless a share link set the view).
  useEffect(() => {
    const s = useStore.getState().scenario.sites[0];
    if (!s || location.hash.includes('s=')) return;
    const t = setTimeout(() => useStore.getState().requestFlyTo([s.lng, s.lat], 15.6), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚡</span>
          <span>NYC EV Charging &amp; Grid Simulator</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <Tip key={t.id} text={t.tip}>
              <button id={`tour-tab-${t.id}`} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'learn' && missionsDone.length > 0 && <span className="badge">{missionsDone.length}/{MISSIONS.length}</span>}
              </button>
            </Tip>
          ))}
        </nav>
        <span className="spacer" />
        <SearchBox />
        <Tip text="5-minute guided tour: the app drives itself through five real questions">
          <button className="btn small" onClick={() => requestTour(true)}>
            Tour
          </button>
        </Tip>
      </header>

      <div className={`main ${mapTab ? '' : 'full'} ${sidebarOpen ? '' : 'collapsed'}`}>
        {mapTab && (
          <aside className="sidebar">
            {sidebarOpen ? (
              <>
                <button className="collapse" onClick={() => setSidebarOpen(false)} title="Hide panel">
                  «
                </button>
                {tab === 'sites' ? <ScenarioPanel /> : <OutlookPanel />}
              </>
            ) : (
              <button className="collapse" onClick={() => setSidebarOpen(true)} title="Show panel">
                »
              </button>
            )}
          </aside>
        )}

        {/* Map stays mounted so Mapbox keeps its state; other tabs overlay it */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          <div style={{ position: 'absolute', inset: 0, visibility: mapTab ? 'visible' : 'hidden' }}>
            <MapView />
          </div>
          {!mapTab && (
            <div className="page" style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--bg)' }}>
              {tab === 'results' && <AnalyticsTab />}
              {tab === 'scenarios' && (
                <div className="page-col">
                  <SavedPanel />
                </div>
              )}
              {tab === 'settings' && (
                <div className="page-col">
                  <SettingsPanel />
                </div>
              )}
              {tab === 'learn' && <LearnTab />}
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
