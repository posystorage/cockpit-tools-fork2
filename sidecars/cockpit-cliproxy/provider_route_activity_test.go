package main

import (
	"context"
	"testing"

	internallogging "github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
)

func TestProviderRouteSelectionPayloadTracksAccount(t *testing.T) {
	account := &accountSpec{ID: "provider-account", Email: "relay@example.com"}
	server := &relayServer{manifest: &manifest{accountByID: map[string]*accountSpec{
		account.ID: account,
	}}}
	ctx := internallogging.WithRequestID(context.Background(), "request-1")
	ctx = context.WithValue(ctx, requestKindContextKey, "text")
	payload, ok := server.providerRouteSelectionPayload(ctx, nil, "gpt-5.6-luna", account.ID, "auth-1")
	if !ok || payload.Type != "auth_selected" || payload.RequestID != "request-1" ||
		payload.AccountID != account.ID || payload.AccountEmail != account.Email ||
		payload.Model != "gpt-5.6-luna" || payload.AuthID != "auth-1" || payload.RequestKind != "text" || payload.Provider != "codex" {
		t.Fatalf("unexpected provider route selection: ok=%v payload=%+v", ok, payload)
	}
	if _, ok := server.providerRouteSelectionPayload(ctx, nil, "gpt-5.6-luna", "missing", ""); ok {
		t.Fatal("an unknown account must not emit an activity event")
	}
	account.Provider = "xai"
	payload, ok = server.providerRouteSelectionPayload(ctx, nil, "grok-4", account.ID, "auth-grok")
	if !ok || payload.Provider != "xai" {
		t.Fatalf("Grok provider should remain visible in diagnostics: %+v", payload)
	}
}
