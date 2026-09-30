package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestApplyClaim(t *testing.T) {
	created := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		room         Room
		now          time.Time
		wantErr      error
		wantBreached bool
		wantWait     int64
	}{
		{name: "idle within SLA", room: Room{Status: "idle", CreatedAt: created}, now: created.Add(2 * time.Minute), wantWait: 120},
		{name: "exactly at limit is not a breach", room: Room{Status: "idle", CreatedAt: created}, now: created.Add(SLAWaitLimit), wantWait: 300},
		{name: "over limit breaches", room: Room{Status: "idle", CreatedAt: created}, now: created.Add(SLAWaitLimit + time.Second), wantBreached: true, wantWait: 301},
		{name: "bot room is claimable", room: Room{Status: "bot", CreatedAt: created}, now: created.Add(time.Minute), wantWait: 60},
		{name: "clock skew clamps wait to zero", room: Room{Status: "idle", CreatedAt: created}, now: created.Add(-time.Minute), wantWait: 0},
		{name: "closed room", room: Room{Status: "closed", CreatedAt: created}, now: created, wantErr: errRoomClosed},
		{name: "already assigned", room: Room{Status: "assigned", AssignedAgent: "Someone", CreatedAt: created}, now: created, wantErr: errAlreadyClaimed},
		{name: "agent set on non-assigned status", room: Room{Status: "idle", AssignedAgent: "Someone", CreatedAt: created}, now: created, wantErr: errAlreadyClaimed},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			room := tc.room
			err := applyClaim(&room, "Agent Demo", tc.now)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				if room != tc.room {
					t.Fatalf("room mutated on failed claim: %+v", room)
				}
				return
			}
			if room.Status != "assigned" || room.AssignedAgent != "Agent Demo" {
				t.Errorf("status/agent = %q/%q", room.Status, room.AssignedAgent)
			}
			if room.ClaimedAt == nil || !room.ClaimedAt.Equal(tc.now) {
				t.Errorf("claimedAt = %v, want %v", room.ClaimedAt, tc.now)
			}
			if room.SLABreached != tc.wantBreached {
				t.Errorf("slaBreached = %v, want %v", room.SLABreached, tc.wantBreached)
			}
			if room.WaitSeconds != tc.wantWait {
				t.Errorf("waitSeconds = %d, want %d", room.WaitSeconds, tc.wantWait)
			}
		})
	}
}

// Validation failures are rejected before Firestore is touched, so a nil
// client is safe here.
func TestClaimRejectsBadRequests(t *testing.T) {
	h := NewRoomHandler(nil)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/rooms/{id}/claim", h.Claim)

	for name, body := range map[string]string{
		"invalid json":   `{`,
		"missing agent":  `{}`,
		"blank agent":    `{"agentName":"   "}`,
		"agent too long": `{"agentName":"` + strings.Repeat("a", 101) + `"}`,
	} {
		t.Run(name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/rooms/abc/claim", strings.NewReader(body)))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
		})
	}
}
