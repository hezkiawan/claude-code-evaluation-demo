package handlers

import (
	"testing"
	"time"
)

func TestIsSLAExpired(t *testing.T) {
	created := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		elapsed time.Duration
		want    bool
	}{
		{"just created", 0, false},
		{"one second before SLA", AssignSLA - time.Second, false},
		{"exactly at SLA", AssignSLA, false},
		{"one second past SLA", AssignSLA + time.Second, true},
		{"long past SLA", 2 * time.Hour, true},
		{"created in the future (clock skew)", -time.Minute, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsSLAExpired(created, created.Add(tt.elapsed)); got != tt.want {
				t.Errorf("IsSLAExpired(elapsed=%v) = %v, want %v", tt.elapsed, got, tt.want)
			}
		})
	}
}

func TestAssignSLAIsFiveMinutes(t *testing.T) {
	if AssignSLA != 5*time.Minute {
		t.Fatalf("AssignSLA = %v, want 5m", AssignSLA)
	}
}

func TestWithSLAStatus(t *testing.T) {
	created := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)
	late := created.Add(AssignSLA + time.Second)
	early := created.Add(time.Minute)

	tests := []struct {
		name   string
		status string
		now    time.Time
		want   bool
	}{
		{"idle past SLA is expired", "idle", late, true},
		{"bot past SLA is expired", "bot", late, true},
		{"idle within SLA is not expired", "idle", early, false},
		{"assigned room never expires", "assigned", late, false},
		{"closed room never expires", "closed", late, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := withSLAStatus(Room{Status: tt.status, CreatedAt: created}, tt.now)
			if got.Expired != tt.want {
				t.Errorf("Expired = %v, want %v", got.Expired, tt.want)
			}
		})
	}
}
