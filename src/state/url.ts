import LZString from 'lz-string';
import type { Scenario } from '../types';

const KEY = 's';

export function encodeScenario(s: Scenario): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(s));
}

export function decodeScenario(str: string): Scenario | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(str);
    if (!json) return null;
    const s = JSON.parse(json);
    if (!s || !Array.isArray(s.sites)) return null;
    return s as Scenario;
  } catch {
    return null;
  }
}

export function readScenarioFromUrl(): Scenario | null {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const v = params.get(KEY);
  return v ? decodeScenario(v) : null;
}

export function shareUrl(s: Scenario): string {
  const url = new URL(window.location.href);
  url.hash = `${KEY}=${encodeScenario(s)}`;
  return url.toString();
}

export function clearUrlScenario() {
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
}
