export const FINGERPRINT_MODELS = [
  'gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna',
] as const;
export const FINGERPRINT_DEFAULT_MODELS = ['gpt-5.6-sol', 'gpt-6-sol', 'gpt-6-astra'];
export const FINGERPRINT_MAX_CONCURRENCY = 10;
export type FingerprintTarget = { id: string; label: string } & (
  | { kind: 'account'; accountId: string }
  | { kind: 'provider'; baseUrl: string; apiKey: string; wireApi: 'responses' | 'chat_completions' }
);
export interface FingerprintPreferences {
  targetIds: string[];
  models: string[];
  concurrency: number;
  samples: number;
}
export interface FingerprintChallenge { id: string; prompt: string; expected_count: number }
export interface FingerprintProbe { reply: string; responseModel?: string; responseId?: string }
export interface FingerprintAnalysis {
  prediction: string; prediction_name: string; probability: number; used_outputs: number;
  family_prediction_name: string; family_probability: number;
  results: { model: string; display_name: string; probability: number; profile_similarity: number }[];
  diagnostics: { index: number; parsed_numbers: number; minimum_numbers: number; accepted: boolean }[];
}
export interface FingerprintSample { challenge: FingerprintChallenge; reply?: string; responseModel?: string; error?: string }
export interface FingerprintResult {
  id: string; targetId: string; targetLabel: string; model: string; requestedSamples: number;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  samples: FingerprintSample[]; analysis?: FingerprintAnalysis; error?: string;
}
