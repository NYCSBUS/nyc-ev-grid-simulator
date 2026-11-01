import { useEffect } from 'react';
import { useStore } from '../state/store';
import { useAreaResult, useAssessments } from '../state/hooks';
import { MISSIONS } from '../sim/missions';

/** Evaluates missions continuously (even when the panel is closed) so completions toast. */
export function useMissionTracker() {
  const scenario = useStore((s) => s.scenario);
  const analyticsVisited = useStore((s) => s.analyticsVisited);
  const done = useStore((s) => s.missionsDone);
  const complete = useStore((s) => s.completeMission);
  const assessments = useAssessments();
  const area = useAreaResult();
  useEffect(() => {
    const ctx = { scenario, assessments, area, analyticsVisited };
    for (const m of MISSIONS) {
      if (done.includes(m.id)) continue;
      if (m.check(ctx).done) complete(m.id);
    }
  }, [scenario, assessments, area, analyticsVisited, done, complete]);
}

export function MissionsPanel() {
  const scenario = useStore((s) => s.scenario);
  const analyticsVisited = useStore((s) => s.analyticsVisited);
  const done = useStore((s) => s.missionsDone);
  const resetMissions = useStore((s) => s.resetMissions);
  const assessments = useAssessments();
  const area = useAreaResult();
  const ctx = { scenario, assessments, area, analyticsVisited };
  return (
    <div className="panel" id="tour-missions">
      <h2>
        Missions
        <button className="btn small" onClick={resetMissions}>
          Reset progress
        </button>
      </h2>
      <p className="muted">
        Optional practice challenges based on what an EV program analyst actually does: finding sites, meeting fairness targets, forecasting load, and building a portfolio on a budget. They are checked automatically as you work. {done.length}/{MISSIONS.length} complete.
      </p>
      {MISSIONS.map((m) => {
        const r = m.check(ctx);
        const isDone = done.includes(m.id) || r.done;
        return (
          <div key={m.id} className={`mission ${isDone ? 'done' : ''}`}>
            <div className="title">
              <span>{m.title}</span>
              <span className={`pill ${isDone ? 'ok' : 'unknown'}`}>{isDone ? 'Complete' : 'Open'}</span>
            </div>
            <div style={{ marginTop: 4 }}>{m.brief}</div>
            <div className="muted" style={{ marginTop: 4, fontStyle: 'italic' }}>
              Why it matters: {m.why}
            </div>
            <ol>
              {m.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Progress: {r.progress}
            </div>
          </div>
        );
      })}
    </div>
  );
}
