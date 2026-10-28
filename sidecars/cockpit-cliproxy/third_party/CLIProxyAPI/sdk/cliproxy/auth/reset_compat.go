package auth

import (
	"context"
	"strings"
	"time"
)

type authRecoveryBarrier struct {
	startedAt       time.Time
	attemptSequence uint64
}

func (b authRecoveryBarrier) rejects(ctx context.Context, startedAt time.Time) bool {
	if sequence := upstreamAttemptSequence(ctx); sequence != 0 && b.attemptSequence != 0 {
		return upstreamAttemptPrecedes(sequence, b.attemptSequence)
	}
	// External callers can still submit timestamp-only results.
	return !b.startedAt.IsZero() && !startedAt.IsZero() && startedAt.Before(b.startedAt)
}

func (m *Manager) markAuthRecoveryBarrier(authID string) {
	if m == nil {
		return
	}
	authID = strings.TrimSpace(authID)
	if authID == "" {
		return
	}
	m.mu.Lock()
	if m.authRecoveryBarriers == nil {
		m.authRecoveryBarriers = make(map[string]authRecoveryBarrier)
	}
	m.authRecoveryBarriers[authID] = authRecoveryBarrier{startedAt: time.Now(), attemptSequence: upstreamAttemptOrder.nextSequence()}
	m.mu.Unlock()
}

// ResetAuthState is the embedded-host compatibility form of ResetQuota. It
// also drops per-model state entries so older Cockpit account-reset semantics
// remain intact.
func (m *Manager) ResetAuthState(ctx context.Context, authID string) (*Auth, error) {
	// Publish a barrier both before and after the reset. The first closes the
	// usual race immediately; the second also covers requests that overlapped
	// the reset itself.
	m.markAuthRecoveryBarrier(authID)
	updated, _, errReset := m.ResetQuota(withSkipPersistWithoutWatermark(ctx), authID)
	if errReset != nil || updated == nil {
		return updated, errReset
	}
	m.mu.Lock()
	if current := m.auths[authID]; current != nil {
		current.ModelStates = nil
		updated = current.Clone()
	}
	m.mu.Unlock()
	m.markAuthRecoveryBarrier(authID)
	if updated != nil {
		if m.scheduler != nil {
			m.scheduler.upsertAuth(updated)
		}
		persisted := updated.Clone()
		go func() {
			_ = m.persist(context.Background(), persisted)
		}()
	}
	return updated, nil
}
