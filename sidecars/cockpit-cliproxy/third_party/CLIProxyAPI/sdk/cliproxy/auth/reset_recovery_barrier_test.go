package auth

import (
	"context"
	"testing"
	"time"

	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
)

func TestResetAuthStateIgnoresResultsFromOlderAttempts(t *testing.T) {
	manager := NewManager(nil, nil, nil)
	const authID = "recovery-barrier-auth"
	const model = "gpt-5.5"

	if _, err := manager.Register(context.Background(), &Auth{
		ID:       authID,
		Provider: "codex",
		Status:   StatusActive,
	}); err != nil {
		t.Fatalf("register auth: %v", err)
	}

	oldAttempt := newUpstreamAttemptContext(context.Background())
	cliproxyexecutor.MarkUpstreamAttempt(oldAttempt)
	if _, err := manager.ResetAuthState(context.Background(), authID); err != nil {
		t.Fatalf("reset auth state: %v", err)
	}
	// Reproduce a coarse clock deterministically: both attempts have exactly
	// the reset timestamp, so only execution ordering can distinguish them.
	barrier := manager.authRecoveryBarriers[authID]
	oldAttempt = context.WithValue(oldAttempt, upstreamAttemptStartedAtContextKey{}, barrier.startedAt)

	manager.MarkResult(oldAttempt, Result{
		AuthID:   authID,
		Provider: "codex",
		Model:    model,
		Success:  false,
		Error: &Error{
			Code:       "upstream_error",
			Message:    "old request failed after recovery",
			HTTPStatus: 503,
		},
	})

	afterOldResult, ok := manager.GetByID(authID)
	if !ok || afterOldResult == nil {
		t.Fatal("auth missing after recovery")
	}
	if len(afterOldResult.ModelStates) != 0 || afterOldResult.Unavailable {
		t.Fatalf("old result restored cleared state: %#v", afterOldResult)
	}

	// A retry derives from the old context but receives a fresh attempt order.
	newAttempt := newUpstreamAttemptContext(oldAttempt)
	newAttempt = context.WithValue(newAttempt, upstreamAttemptStartedAtContextKey{}, barrier.startedAt)
	if upstreamAttemptSequence(newAttempt) == upstreamAttemptSequence(oldAttempt) {
		t.Fatal("retry inherited the previous attempt sequence")
	}
	cliproxyexecutor.MarkUpstreamAttempt(newAttempt)
	manager.MarkResult(newAttempt, Result{
		AuthID:   authID,
		Provider: "codex",
		Model:    model,
		Success:  false,
		Error: &Error{
			Code:       "upstream_error",
			Message:    "new request failed after recovery",
			HTTPStatus: 503,
		},
	})

	afterNewResult, ok := manager.GetByID(authID)
	if !ok || afterNewResult == nil || afterNewResult.ModelStates[model] == nil {
		t.Fatalf("new result was not recorded: %#v", afterNewResult)
	}
}

func TestRecoveryBarrierSequenceWrapAndTimestampOnlyCompatibility(t *testing.T) {
	var order upstreamAttemptSequencer
	order.next.Store(^uint64(0) - 1)
	oldSequence := order.nextSequence()
	barrierSequence := order.nextSequence()
	newSequence := order.nextSequence()
	if oldSequence == 0 || barrierSequence == 0 || newSequence == 0 {
		t.Fatal("wrapped sequence must never be zero")
	}
	stamp := time.Unix(100, 0)
	barrier := authRecoveryBarrier{startedAt: stamp, attemptSequence: barrierSequence}
	oldAttempt := context.WithValue(context.Background(), upstreamAttemptSequenceContextKey{}, oldSequence)
	newAttempt := context.WithValue(oldAttempt, upstreamAttemptSequenceContextKey{}, newSequence)
	if !barrier.rejects(oldAttempt, stamp) || barrier.rejects(newAttempt, stamp) {
		t.Fatal("wraparound must reject old attempts and accept new attempts at the same timestamp")
	}
	if !barrier.rejects(context.Background(), stamp.Add(-time.Nanosecond)) || barrier.rejects(context.Background(), stamp.Add(time.Nanosecond)) {
		t.Fatal("timestamp-only external results must retain the recovery barrier")
	}
}

func TestResetAuthStateDoesNotWaitForExistingPersistence(t *testing.T) {
	store := &countingStore{}
	manager := NewManager(store, nil, nil)
	const authID = "non-blocking-recovery-auth"
	if _, err := manager.Register(context.Background(), &Auth{
		ID:       authID,
		Provider: "codex",
		Status:   StatusActive,
		Metadata: map[string]any{"type": "codex"},
	}); err != nil {
		t.Fatalf("register auth: %v", err)
	}

	lockVal, _ := manager.persistLocks.LoadOrStore(authID, &authPersistLock{})
	persistLock := lockVal.(*authPersistLock)
	persistLock.mu.Lock()

	done := make(chan error, 1)
	go func() {
		_, err := manager.ResetAuthState(context.Background(), authID)
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("reset auth state: %v", err)
		}
	case <-time.After(250 * time.Millisecond):
		persistLock.mu.Unlock()
		t.Fatal("reset auth state waited for the persistence lock")
	}
	persistLock.mu.Unlock()
}
