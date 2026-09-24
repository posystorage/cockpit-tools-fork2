import type { FingerprintAnalysis } from '../../types/codexFingerprint';
export function parseNumbers(text: string): number[];
export function analyzeGlobalOutputs(outputs: { text: string; expected_count: number }[], bank: unknown): FingerprintAnalysis;
