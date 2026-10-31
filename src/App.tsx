import { useStore, type Panel, type Tab } from './state/store';
import { useLiveData, useStaticData, useToastAutoClear } from './state/hooks';
import { MapView } from './components/MapView';
import { ScenarioPanel } from './components/ScenarioPanel';
import { LayersPanel } from './components/LayersPanel';
import { FiltersPanel } from './components/FiltersPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { MissionsPanel, useMissionTracker } from './components/MissionsPanel';
import { SavedPanel } from './components/SavedPanel';
import { AnalyticsTab } from './components/AnalyticsTab';
import { HelpTab } from './components/HelpTab';
import { SearchBox } from './components/SearchBox';
import { useTour } from './components/Tour';
import { MISSIONS } from './sim/missions';
import { Tip } from './components/ui';

const RAIL: Array<{ id: Panel; icon: string; label: string }> = [
  { id: 'scenario', icon: '⚡', label: 'Scenario: sites & area adoption' },
  { id: 'layers', icon: '◧', label: 'Map layers' },
  { id: 'filters', icon: '⚲', label: 'Filters' },
  { id: 'settings', icon: '⚙', label: 'Model settings' },
  { id: 'missions', icon: '◎', label: 'Missions' },
  { id: 'saved', icon: '▤', label: 'Saved scenarios, share & compare' },
];

export default function App() {
  useStaticData();
  useLiveData();
  useMissionTracker();
  useTour();
  useToastAutoClear();

  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const toast = useStore((s) => s.toast);
  const missionsDone = useStore((s) => s.missionsDone);
  const requestTour = useStore((s) => s.requestTour);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'map', label: 'Map' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'help', label: 'Help' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚡</span>
          <span>NYC EV Load Growth Simulator</span>
          <span className="muted" style={{ fontWeight: 400 }}>
            · Con Edison hosting capacity
          </span>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} id={`tour-tab-${t.id}`} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <SearchBox />
        <Tip text="Guided walkthrough: the app answers five real analyst questions step by step">
          <button className="btn small" onClick={() => requestTour(true)}>
            Tour
          </button>
        </Tip>
      </header>

      <div className={`main ${sidebarOpen ? '' : 'collapsed'}`}>
        <aside className="sidebar">
          <div className="rail">
            {RAIL.map((r) => (
              <Tip key={r.id} text={r.label}>
                <button
                  id={`tour-rail-${r.id}`}
                  className={panel === r.id && sidebarOpen ? 'active' : ''}
                  onClick={() => {
                    if (panel === r.id && sidebarOpen) setSidebarOpen(false);
                    else {
                      setPanel(r.id);
                      if (tab !== 'map') setTab('map');
                    }
                  }}
                >
                  {r.icon}
                  {r.id === 'missions' && missionsDone.length > 0 && <span className="badge">{missionsDone.length}/{MISSIONS.length}</span>}
                </button>
              </Tip>
            ))}
            <span className="grow" />
            <Tip text={sidebarOpen ? 'Collapse panel' : 'Expand panel'}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? '«' : '»'}</button>
            </Tip>
          </div>
          {sidebarOpen && (
            <>
              {panel === 'scenario' && <ScenarioPanel />}
              {panel === 'layers' && <LayersPanel />}
              {panel === 'filters' && <FiltersPanel />}
              {panel === 'settings' && <SettingsPanel />}
              {panel === 'missions' && <MissionsPanel />}
              {panel === 'saved' && <SavedPanel />}
            </>
          )}
        </aside>

        {/* Map stays mounted so Mapbox keeps its state; other tabs overlay it */}
        <div style={{ position: 'relative', minHeight: 0 }}>
          <div style={{ position: 'absolute', inset: 0, visibility: tab === 'map' ? 'visible' : 'hidden' }}>
            <MapView />
          </div>
          {tab === 'analytics' && (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--bg)' }}>
              <AnalyticsTab />
            </div>
          )}
          {tab === 'help' && (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--bg)' }}>
              <HelpTab />
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
