package handlers

import (
	"testing"
	"time"
)

func TestSLAExpired(t *testing.T) {
	created := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name   string
		waited time.Duration
		want   bool
	}{
		{"just created", 0, false},
		{"under window", 4*time.Minute + 59*time.Second, false},
		{"exactly at window", SLAWindow, false},
		{"just past window", SLAWindow + time.Second, true},
		{"long overdue", time.Hour, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SLAExpired(created, created.Add(tt.waited)); got != tt.want {
				t.Errorf("SLAExpired after %v = %v, want %v", tt.waited, got, tt.want)
			}
		})
	}
}
