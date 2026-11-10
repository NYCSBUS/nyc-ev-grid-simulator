import { useEffect, useState } from 'react';
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
import { TOUR_SEEN_KEY, useTour } from './components/Tour';
import { MISSIONS } from './sim/missions';
import { Tip } from './components/ui';

const TABS: Array<{ id: Tab; label: string; tip: string }> = [
  { id: 'sites', label: 'Sites', tip: 'Place charging sites and see the traffic lights on nearby grid equipment' },
  { id: 'outlook', label: 'Outlook', tip: 'Borough-wide EV growth by year: where the grid fills up first' },
  { id: 'results', label: 'Results', tip: 'The bottom line in plain sentences, then charts, tables, costs and before/after comparison' },
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
  const undo = useStore((s) => s.undo);
  const undoLast = useStore((s) => s.undoLast);
  const missionsDone = useStore((s) => s.missionsDone);
  const requestTour = useStore((s) => s.requestTour);
  const tourRequested = useStore((s) => s.tourRequested);
  // First visit: offer the tour, never start it unasked.
  const [welcome, setWelcome] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY) && !location.hash.includes('s='));
  const closeWelcome = (tour: boolean) => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    setWelcome(false);
    if (tour) requestTour(true);
  };

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
          <span className="logo" aria-hidden>
            ⚡
          </span>
          <span className="name">NYC EV Charging &amp; Grid Simulator</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <Tip key={t.id} text={t.tip} hideOnPress>
              <button id={`tour-tab-${t.id}`} className={`tab ${tab === t.id ? 'active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'learn' && missionsDone.length > 0 && <span className="badge">{missionsDone.length}/{MISSIONS.length}</span>}
              </button>
            </Tip>
          ))}
        </nav>
        <span className="spacer" />
        <SearchBox />
        <Tip text="5-minute guided tour: the app drives itself through five real questions. Your own work comes back at the end." hideOnPress>
          <button className="btn small" id="tour-start" onClick={() => closeWelcome(true)}>
            Tour
          </button>
        </Tip>
      </header>

      <main className={`main ${mapTab ? '' : 'full'} ${sidebarOpen ? '' : 'collapsed'}`}>
        {mapTab && (
          <aside className="sidebar" aria-label={tab === 'sites' ? 'Charging sites' : 'Outlook settings'}>
            {sidebarOpen ? (
              <>
                <button className="collapse" onClick={() => setSidebarOpen(false)} title="Hide panel" aria-label="Hide panel">
                  «
                </button>
                {tab === 'sites' ? <ScenarioPanel /> : <OutlookPanel />}
              </>
            ) : (
              <button className="collapse" onClick={() => setSidebarOpen(true)} title="Show panel" aria-label="Show panel">
                »
              </button>
            )}
          </aside>
        )}

        {/* Map stays mounted so Mapbox keeps its state; other tabs overlay it */}
        <div className="map-col" style={{ position: 'relative', minHeight: 0, minWidth: 0 }}>
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
      </main>
      {welcome && !tourRequested && (
        <div className="welcome" role="dialog" aria-label="Welcome">
          <b>New here?</b>
          <p>
            This simulator answers one question: <b>can the grid take EV chargers at this spot?</b> Click a site to see its verdict, drag its pin to try another corner, or let a short tour show you five real questions.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => closeWelcome(true)}>
              Take the 5-minute tour
            </button>
            <button className="btn" onClick={() => closeWelcome(false)}>
              Explore on my own
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {undo && undo.label === toast && (
            <button className="btn small" onClick={undoLast}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
