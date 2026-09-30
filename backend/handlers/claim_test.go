package handlers

import (
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
