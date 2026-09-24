import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { normalizeFingerprintPreferences, runFingerprintQueue } from '../utils/codexFingerprint';
import type { FingerprintPreferences, FingerprintProbe, FingerprintResult, FingerprintTarget } from '../types/codexFingerprint';

const profile = (import.meta.env.VITE_COCKPIT_TOOLS_PROFILE || '').trim();
const key = 'agtools.codex.fingerprint.preferences.v1' + (profile && profile !== 'prod' ? '.' + profile : '');
function loadPreferences(): FingerprintPreferences {
  try { return normalizeFingerprintPreferences(JSON.parse(localStorage.getItem(key) || 'null')); }
  catch { return normalizeFingerprintPreferences(); }
}
let savedPreferences = loadPreferences();
function persist(preferences: FingerprintPreferences) {
  savedPreferences = preferences;
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Storage can be unavailable. */ }
}
interface FingerprintState {
  visible: boolean; running: boolean; cancelled: boolean; runId: string | null; error: string | null;
  preferences: FingerprintPreferences; results: FingerprintResult[];
  open: () => void; close: () => void;
  configure: (patch: Partial<FingerprintPreferences>) => void;
  start: (targets: FingerprintTarget[]) => Promise<void>; cancel: () => Promise<void>;
}
export const useCodexFingerprintStore = create<FingerprintState>((set, get) => ({
  visible: false, running: false, cancelled: false, runId: null, error: null,
  preferences: savedPreferences, results: [],
  open: () => set({ visible: true }), close: () => set({ visible: false }),
  configure: (patch) => {
    if (get().running) return;
    const preferences = normalizeFingerprintPreferences({ ...get().preferences, ...patch });
    // Accounts follow the last started test; other options remember edits immediately.
    persist({ ...preferences, targetIds: savedPreferences.targetIds });
    set({ preferences });
  },
  cancel: async () => {
    const runId = get().runId;
    set({ cancelled: true });
    if (runId) try { await invoke('codex_fingerprint_cancel', { runId }); }
    catch (error) { set({ error: String(error) }); }
  },
  start: async (available) => {
    if (get().running) return;
    const preferences = normalizeFingerprintPreferences(get().preferences);
    const targets = available.filter((target) => preferences.targetIds.includes(target.id));
    if (!targets.length || !preferences.models.length) { set({ error: '请至少选择一个账号／上游和一个模型。' }); return; }
    const runId = crypto.randomUUID();
    const results: FingerprintResult[] = targets.flatMap((target) => preferences.models.map((model) => ({
      id: target.id + ':' + model, targetId: target.id, targetLabel: target.label, model, requestedSamples: preferences.samples, status: 'queued', samples: [],
    })));
    persist({ ...preferences, targetIds: targets.map((target) => target.id) });
    set({ runId, running: true, cancelled: false, results, error: null });
    const update = (id: string, patch: Partial<FingerprintResult>) => set((state) => ({
      results: state.results.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
    let begun = false;
    try {
      const [{ generateChallenges }, { analyzeGlobalOutputs }, { default: bank }] = await Promise.all([
        import('../vendor/modeltrace/challenge-browser.js'), import('../vendor/modeltrace/fingerprint-core.js'),
        import('../vendor/modeltrace/unified_bank.json'),
      ]);
      const challenges = generateChallenges(preferences.samples);
      if (get().cancelled) return;
      await invoke('codex_fingerprint_begin', { runId, concurrency: preferences.concurrency });
      begun = true;
      if (get().cancelled) { await invoke('codex_fingerprint_cancel', { runId }); return; }
      await runFingerprintQueue(results, preferences.concurrency, () => get().cancelled, async (item) => {
        const target = targets.find((value) => value.id === item.targetId)!;
        const samples: FingerprintResult['samples'] = [];
        update(item.id, { status: 'running' });
        for (const challenge of challenges) {
          if (get().cancelled) break;
          try {
            const output = await invoke<FingerprintProbe>('codex_fingerprint_probe', { runId, target, model: item.model, prompt: challenge.prompt });
            samples.push({ challenge, reply: output.reply, responseModel: output.responseModel });
          } catch (error) {
            samples.push({ challenge, error: String(error) });
            break; // No hidden retries on quota, auth, or transport errors.
          }
          update(item.id, { samples: [...samples] });
        }
        const outputs = samples.filter((sample) => sample.reply).map((sample) => ({ text: sample.reply!, expected_count: sample.challenge.expected_count }));
        try {
          const analysis = analyzeGlobalOutputs(outputs, bank);
          update(item.id, { samples, analysis, status: get().cancelled ? 'cancelled' : analysis.used_outputs === preferences.samples ? 'completed' : 'partial',
            error: samples.find((sample) => sample.error)?.error });
        } catch (error) {
          update(item.id, { samples, status: get().cancelled ? 'cancelled' : 'failed', error: samples.find((sample) => sample.error)?.error || String(error) });
        }
      });
    } catch (error) { set({ error: String(error) }); }
    finally {
      if (begun) try { await invoke('codex_fingerprint_finish', { runId }); }
      catch (error) { set({ error: String(error) }); }
      set((state) => ({ running: false, results: state.results.map((item) =>
        item.status === 'queued' || item.status === 'running'
          ? { ...item, status: state.cancelled ? 'cancelled' : 'failed', error: state.error || undefined } : item) }));
    }
  },
}));
