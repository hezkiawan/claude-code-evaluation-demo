package handlers

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestClaimRoom(t *testing.T) {
	createdAt := time.Date(2026, 9, 30, 9, 0, 0, 0, time.UTC)
	jakarta := time.FixedZone("WIB", 7*60*60)
	now := time.Date(2026, 9, 30, 16, 3, 0, 0, jakarta) // 09:03 UTC

	room := func(status string) *Room {
		return &Room{ID: "r1", Name: "Budi", Platform: "whatsapp", Status: status, CreatedAt: createdAt}
	}

	successCases := []struct {
		name      string
		status    string
		agentName string
		wantAgent string
	}{
		{"idle room", "idle", "Agent Demo", "Agent Demo"},
		{"bot room", "bot", "Agent Demo", "Agent Demo"},
		{"name is trimmed", "idle", "  Agent Demo \t", "Agent Demo"},
		{"100-char name", "idle", strings.Repeat("a", 100), strings.Repeat("a", 100)},
	}
	for _, tc := range successCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ClaimRoom(room(tc.status), tc.agentName, now)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Status != "assigned" {
				t.Errorf("status = %q, want assigned", got.Status)
			}
			if got.AssignedAgent != tc.wantAgent {
				t.Errorf("assignedAgent = %q, want %q", got.AssignedAgent, tc.wantAgent)
			}
			wantClaimedAt := time.Date(2026, 9, 30, 9, 3, 0, 0, time.UTC)
			if got.ClaimedAt == nil || !got.ClaimedAt.Equal(wantClaimedAt) || got.ClaimedAt.Location() != time.UTC {
				t.Errorf("claimedAt = %v, want %v in UTC", got.ClaimedAt, wantClaimedAt)
			}
			if got.ID != "r1" || got.Name != "Budi" || got.Platform != "whatsapp" || !got.CreatedAt.Equal(createdAt) {
				t.Errorf("unrelated fields changed: %+v", got)
			}
		})
	}

	claimed := room("assigned")
	claimed.AssignedAgent = "Agent Demo"

	errorCases := []struct {
		name      string
		room      *Room
		agentName string
		wantErr   error
	}{
		{"already claimed by another agent", claimed, "Agent Smith", ErrAlreadyClaimed},
		{"already claimed by the same agent", claimed, "Agent Demo", ErrAlreadyClaimed},
		{"closed room", room("closed"), "Agent Demo", ErrRoomClosed},
		{"room not found", nil, "Agent Demo", ErrRoomNotFound},
		{"blank name", room("idle"), "", ErrInvalidAgentName},
		{"whitespace-only name", room("idle"), "   \t", ErrInvalidAgentName},
		{"101-char name", room("idle"), strings.Repeat("a", 101), ErrInvalidAgentName},
	}
	for _, tc := range errorCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ClaimRoom(tc.room, tc.agentName, now)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
		})
	}

	t.Run("already-claimed error names the owner", func(t *testing.T) {
		_, err := ClaimRoom(claimed, "Agent Smith", now)
		if err == nil || err.Error() != "room already claimed by Agent Demo" {
			t.Fatalf("err = %v, want %q", err, "room already claimed by Agent Demo")
		}
	})

	t.Run("records wait time and SLA breach", func(t *testing.T) {
		slaCases := []struct {
			name         string
			wait         time.Duration
			wantSeconds  int64
			wantBreached bool
		}{
			{"claimed immediately", 0, 0, false},
			{"4:59", 4*time.Minute + 59*time.Second, 299, false},
			{"exactly 5:00", 5 * time.Minute, 300, false},
			{"5:00 and a fraction is still 300s, not breached", 5*time.Minute + 400*time.Millisecond, 300, false},
			{"5:01", 5*time.Minute + time.Second, 301, true},
			{"fractional seconds truncate", 2*time.Minute + 1500*time.Millisecond, 121, false},
			{"an hour", time.Hour, 3600, true},
		}
		for _, tc := range slaCases {
			t.Run(tc.name, func(t *testing.T) {
				got, err := ClaimRoom(room("idle"), "Agent Demo", createdAt.Add(tc.wait).In(jakarta))
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got.WaitSeconds == nil || *got.WaitSeconds != tc.wantSeconds {
					t.Errorf("waitSeconds = %v, want %d", deref(got.WaitSeconds), tc.wantSeconds)
				}
				if got.SLABreached == nil || *got.SLABreached != tc.wantBreached {
					t.Errorf("slaBreached = %v, want %v", deref(got.SLABreached), tc.wantBreached)
				}
			})
		}
	})

	t.Run("does not mutate the input room", func(t *testing.T) {
		r := room("idle")
		if _, err := ClaimRoom(r, "Agent Demo", now); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if r.Status != "idle" || r.AssignedAgent != "" || r.ClaimedAt != nil {
			t.Errorf("input mutated: %+v", r)
		}
	})
}

func TestRoomJSONClaimFields(t *testing.T) {
	createdAt := time.Date(2026, 9, 30, 9, 0, 0, 0, time.UTC)

	unclaimed, err := json.Marshal(Room{ID: "r1", Status: "idle", CreatedAt: createdAt})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"assignedAgent", "claimedAt", "waitSeconds", "slaBreached"} {
		if strings.Contains(string(unclaimed), `"`+key+`"`) {
			t.Errorf("unclaimed room JSON has %q: %s", key, unclaimed)
		}
	}

	claimed, err := ClaimRoom(&Room{ID: "r1", Status: "idle", CreatedAt: createdAt}, "Agent Demo", createdAt)
	if err != nil {
		t.Fatal(err)
	}
	got, err := json.Marshal(claimed)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"waitSeconds":0`, `"slaBreached":false`} {
		if !strings.Contains(string(got), want) {
			t.Errorf("claimed room JSON missing %s: %s", want, got)
		}
	}
}

func deref[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}
