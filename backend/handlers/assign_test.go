package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 9, 24, 10, 10, 0, 0, time.UTC)

func TestApplyAssignment(t *testing.T) {
	fresh := testNow.Add(-time.Minute)
	stale := testNow.Add(-(AssignSLA + time.Second))

	tests := []struct {
		name       string
		room       Room
		wantErr    error
		wantBreach bool
	}{
		{"idle within SLA", Room{Status: "idle", CreatedAt: fresh}, nil, false},
		{"bot within SLA", Room{Status: "bot", CreatedAt: fresh}, nil, false},
		{"idle exactly at SLA", Room{Status: "idle", CreatedAt: testNow.Add(-AssignSLA)}, nil, false},
		{"idle past SLA is assigned but breached", Room{Status: "idle", CreatedAt: stale}, nil, true},
		{"already assigned", Room{Status: "assigned", CreatedAt: fresh}, ErrRoomAlreadyAssigned, false},
		{"closed", Room{Status: "closed", CreatedAt: fresh}, ErrRoomClosed, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := applyAssignment(tt.room, testNow)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil {
				return
			}
			if got.Status != "assigned" {
				t.Errorf("Status = %q, want assigned", got.Status)
			}
			if got.AssignedAt == nil || !got.AssignedAt.Equal(testNow) {
				t.Errorf("AssignedAt = %v, want %v", got.AssignedAt, testNow)
			}
			if got.SLABreached != tt.wantBreach {
				t.Errorf("SLABreached = %v, want %v", got.SLABreached, tt.wantBreach)
			}
			if got.Expired {
				t.Error("Expired should be false once assigned")
			}
			if tt.room.AssignedAt != nil || tt.room.Status == "assigned" {
				t.Error("input room was mutated")
			}
		})
	}
}

type fakeAssigner struct {
	room   Room
	err    error
	gotID  string
	gotNow time.Time
}

func (f *fakeAssigner) Assign(_ context.Context, id string, now time.Time) (Room, error) {
	f.gotID, f.gotNow = id, now
	return f.room, f.err
}

func serveAssign(t *testing.T, fake *fakeAssigner, id string) *httptest.ResponseRecorder {
	t.Helper()
	h := &RoomHandler{assigner: fake, now: func() time.Time { return testNow }}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/rooms/{id}/assign", h.Assign)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/rooms/"+id+"/assign", nil))
	return rec
}

func decodeBody[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return v
}

func TestAssignHandlerSuccess(t *testing.T) {
	assignedAt := testNow
	fake := &fakeAssigner{room: Room{
		ID: "room1", Name: "Nadia", Platform: "whatsapp", Status: "assigned",
		CreatedAt: testNow.Add(-10 * time.Minute), AssignedAt: &assignedAt, SLABreached: true,
	}}

	rec := serveAssign(t, fake, "room1")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body)
	}
	if fake.gotID != "room1" {
		t.Errorf("assigner got id %q, want room1", fake.gotID)
	}
	if !fake.gotNow.Equal(testNow) {
		t.Errorf("assigner got now %v, want %v", fake.gotNow, testNow)
	}
	body := decodeBody[map[string]any](t, rec)
	if body["status"] != "assigned" || body["slaBreached"] != true || body["id"] != "room1" {
		t.Errorf("unexpected body: %v", body)
	}
	if _, ok := body["assignedAt"]; !ok {
		t.Error("body missing assignedAt")
	}
}

func TestAssignHandlerErrors(t *testing.T) {
	tests := []struct {
		name       string
		id         string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{"not found", "missing", ErrRoomNotFound, http.StatusNotFound, "room not found"},
		{"already assigned", "room1", ErrRoomAlreadyAssigned, http.StatusConflict, "room is already assigned"},
		{"closed", "room1", ErrRoomClosed, http.StatusConflict, "room is closed"},
		{"wrapped sentinel", "room1", errors.Join(errors.New("tx"), ErrRoomClosed), http.StatusConflict, "room is closed"},
		{"storage failure hides details", "room1", errors.New("rpc error: secret internals"), http.StatusInternalServerError, "failed to assign room"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serveAssign(t, &fakeAssigner{err: tt.err}, tt.id)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := decodeBody[map[string]string](t, rec)["error"]; got != tt.wantMsg {
				t.Errorf("error = %q, want %q", got, tt.wantMsg)
			}
		})
	}
}

func TestAssignHandlerRejectsInvalidIDs(t *testing.T) {
	for _, id := range []string{"a%2Fb", "__reserved__", strings.Repeat("a", 129)} {
		t.Run(id[:min(len(id), 12)], func(t *testing.T) {
			fake := &fakeAssigner{}
			rec := serveAssign(t, fake, id)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			if fake.gotID != "" {
				t.Error("assigner should not be called for an invalid id")
			}
		})
	}
}
