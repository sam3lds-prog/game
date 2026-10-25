/**
 * Consent-aware, minimal telemetry.
 *
 * - Off until the player turns on "Share anonymous gameplay stats". Nothing is recorded before.
 * - No personal data: events carry puzzle ids, sizes, modes, times, counts and error codes only.
 *   An anonymous random install id exists only while consent is on, and is deleted when it's off.
 * - Sends nowhere unless VITE_ANALYTICS_ENDPOINT is set at build time; otherwise events stay in a
 *   small on-device buffer (useful for support and debugging).
 */
import { kv, PREFIX } from './storage';

export type AnalyticsEvent =
  | 'tutorial_step_started'
  | 'tutorial_step_completed'
  | 'level_started'
  | 'level_completed'
  | 'level_failed'
  | 'hint_explained'
  | 'hint_revealed'
  | 'puzzle_restored'
  | 'mode_selected'
  | 'face_reaction_summary'
  | 'ad_requested'
  | 'ad_shown'
  | 'ad_rewarded'
  | 'ad_failed'
  | 'purchase_started'
  | 'purchase_succeeded'
  | 'purchase_restored'
  | 'crash';

export type Props = Record<string, string | number | boolean>;

export interface Analytics {
  readonly consent: boolean;
  setConsent(on: boolean): void;
  track(event: AnalyticsEvent, props?: Props): void;
  /** Recent events kept on the device (newest last). */
  recent(): Array<{ e: AnalyticsEvent; t: number; p: Props }>;
}

const CONSENT_KEY = `${PREFIX}v2.analytics.consent`;
const ID_KEY = `${PREFIX}v2.analytics.id`;
const BUFFER_KEY = `${PREFIX}v2.analytics.buffer`;
const BUFFER_CAP = 200;
const ALLOWED_PROP = /^[a-z][a-zA-Z0-9_]{0,31}$/;

export function createAnalytics(opts: { endpoint?: string; now?: () => number; appVersion?: string } = {}): Analytics {
  const now = opts.now ?? (() => Date.now());
  let consent = kv.get<boolean>(CONSENT_KEY, false);
  let queue: Array<{ e: AnalyticsEvent; t: number; p: Props }> = [];
  let flushTimer: number | null = null;

  const installId = () => {
    let id = kv.get<string | null>(ID_KEY, null);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${now()}-${Math.random().toString(36).slice(2)}`;
      kv.set(ID_KEY, id);
    }
    return id;
  };

  const clean = (p: Props = {}): Props => {
    const out: Props = {};
    for (const [k, v] of Object.entries(p)) {
      if (!ALLOWED_PROP.test(k)) continue;
      if (typeof v === 'string') out[k] = v.slice(0, 64);
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return out;
  };

  const flush = () => {
    flushTimer = null;
    if (!opts.endpoint || !queue.length || !consent) return;
    const batch = queue;
    queue = [];
    try {
      void fetch(opts.endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: installId(), v: opts.appVersion ?? 'dev', events: batch }),
      }).catch(() => undefined);
    } catch {
      /* offline: drop */
    }
  };

  return {
    get consent() {
      return consent;
    },
    setConsent(on) {
      consent = on;
      kv.set(CONSENT_KEY, on);
      if (!on) {
        kv.remove(ID_KEY);
        kv.remove(BUFFER_KEY);
        queue = [];
      }
    },
    track(e, props) {
      if (!consent) return;
      const ev = { e, t: now(), p: clean(props) };
      const buf = kv.get<typeof queue>(BUFFER_KEY, []);
      buf.push(ev);
      kv.set(BUFFER_KEY, buf.slice(-BUFFER_CAP));
      if (opts.endpoint) {
        queue.push(ev);
        if (flushTimer === null) flushTimer = window.setTimeout(flush, 5000);
      }
    },
    recent() {
      return kv.get<typeof queue>(BUFFER_KEY, []);
    },
  };
}

/** Reports uncaught errors as `crash` events (only with consent). */
export function installCrashReporting(a: Analytics): void {
  window.addEventListener('error', (e) => a.track('crash', { kind: 'error', message: String(e.message ?? '').slice(0, 64), line: e.lineno ?? 0 }));
  window.addEventListener('unhandledrejection', (e) => a.track('crash', { kind: 'rejection', message: String((e.reason as Error)?.message ?? e.reason ?? '').slice(0, 64) }));
}

export const noAnalytics: Analytics = {
  consent: false,
  setConsent() {},
  track() {},
  recent: () => [],
};
