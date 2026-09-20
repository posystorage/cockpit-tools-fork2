package util

import "testing"

func TestMaskSensitiveHeaderValueRedactsCodexTurnState(t *testing.T) {
	for _, key := range []string{"X-Codex-Turn-State", "x-codex-turn-state"} {
		if got := MaskSensitiveHeaderValue(key, "opaque-turn-state"); got != "[REDACTED]" {
			t.Fatalf("%s: got %q", key, got)
		}
	}
	if got := MaskSensitiveHeaderValue("X-Request-Id", "req-1"); got != "req-1" {
		t.Fatalf("unrelated header changed: %q", got)
	}
}
