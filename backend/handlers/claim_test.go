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

var created = time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)

func TestApplyClaim(t *testing.T) {
	tests := []struct {
		name         string
		status       string
		waited       time.Duration
		wantErr      error
		wantBreached bool
	}{
		{name: "idle room is claimed", status: "idle", waited: time.Minute},
		{name: "bot room is claimed", status: "bot", waited: time.Minute},
		{name: "waited 4m59s is within SLA", status: "idle", waited: 4*time.Minute + 59*time.Second},
		{name: "waited exactly 5m is within SLA", status: "idle", waited: 5 * time.Minute},
		{name: "waited 5m01s breaches SLA", status: "idle", waited: 5*time.Minute + time.Second, wantBreached: true},
		{name: "already assigned room is rejected", status: "assigned", waited: time.Minute, wantErr: errRoomAlreadyClaimed},
		{name: "closed room is rejected", status: "closed", waited: time.Minute, wantErr: errRoomClosed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			room := Room{ID: "r1", Name: "Cust", Platform: "whatsapp", Status: tt.status, CreatedAt: created}
			now := created.Add(tt.waited)

			got, err := applyClaim(room, "Agent Demo", now)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Status != "assigned" {
				t.Errorf("Status = %q, want assigned", got.Status)
			}
			if got.AssignedAgent != "Agent Demo" {
				t.Errorf("AssignedAgent = %q, want Agent Demo", got.AssignedAgent)
			}
			if got.ClaimedAt == nil || !got.ClaimedAt.Equal(now) {
				t.Errorf("ClaimedAt = %v, want %v", got.ClaimedAt, now)
			}
			if got.SLABreached != tt.wantBreached {
				t.Errorf("SLABreached = %v, want %v", got.SLABreached, tt.wantBreached)
			}
		})
	}
}

func TestApplyClaimDoesNotMutateInput(t *testing.T) {
	room := Room{ID: "r1", Status: "idle", CreatedAt: created}

	if _, err := applyClaim(room, "Agent Demo", created.Add(10*time.Minute)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if room.Status != "idle" || room.AssignedAgent != "" || room.ClaimedAt != nil || room.SLABreached {
		t.Errorf("input room was mutated: %+v", room)
	}
}

type claimCall struct {
	id, agentName string
}

func newClaimServer(stub func(ctx context.Context, id, agentName string) (Room, error)) (*http.ServeMux, *[]claimCall) {
	calls := &[]claimCall{}
	h := &RoomHandler{claimRoom: func(ctx context.Context, id, agentName string) (Room, error) {
		*calls = append(*calls, claimCall{id, agentName})
		return stub(ctx, id, agentName)
	}}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/rooms/{id}/claim", h.Claim)
	return mux, calls
}

func TestClaimHandler(t *testing.T) {
	claimedAt := created.Add(6 * time.Minute)
	okRoom := Room{ID: "r1", Name: "Cust", Platform: "whatsapp", Status: "assigned", CreatedAt: created,
		AssignedAgent: "Agent Demo", ClaimedAt: &claimedAt, SLABreached: true}

	tests := []struct {
		name       string
		path       string
		body       string
		stubErr    error
		wantStatus int
		wantCalled bool
	}{
		{name: "claims room", path: "/api/rooms/r1/claim", body: `{"agentName":"  Agent Demo  "}`, wantStatus: http.StatusOK, wantCalled: true},
		{name: "invalid JSON", path: "/api/rooms/r1/claim", body: `{`, wantStatus: http.StatusBadRequest},
		{name: "missing agentName", path: "/api/rooms/r1/claim", body: `{}`, wantStatus: http.StatusBadRequest},
		{name: "blank agentName", path: "/api/rooms/r1/claim", body: `{"agentName":"   "}`, wantStatus: http.StatusBadRequest},
		{name: "agentName too long", path: "/api/rooms/r1/claim", body: `{"agentName":"` + strings.Repeat("a", 101) + `"}`, wantStatus: http.StatusBadRequest},
		{name: "room id with slash", path: "/api/rooms/a%2Fb/claim", body: `{"agentName":"Agent Demo"}`, wantStatus: http.StatusBadRequest},
		{name: "room not found", path: "/api/rooms/r1/claim", body: `{"agentName":"Agent Demo"}`, stubErr: errRoomNotFound, wantStatus: http.StatusNotFound, wantCalled: true},
		{name: "room already claimed", path: "/api/rooms/r1/claim", body: `{"agentName":"Agent Demo"}`, stubErr: errRoomAlreadyClaimed, wantStatus: http.StatusConflict, wantCalled: true},
		{name: "room closed", path: "/api/rooms/r1/claim", body: `{"agentName":"Agent Demo"}`, stubErr: errRoomClosed, wantStatus: http.StatusConflict, wantCalled: true},
		{name: "storage failure", path: "/api/rooms/r1/claim", body: `{"agentName":"Agent Demo"}`, stubErr: errors.New("boom"), wantStatus: http.StatusInternalServerError, wantCalled: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux, calls := newClaimServer(func(context.Context, string, string) (Room, error) {
				if tt.stubErr != nil {
					return Room{}, tt.stubErr
				}
				return okRoom, nil
			})
			req := httptest.NewRequest(http.MethodPost, tt.path, strings.NewReader(tt.body))
			rec := httptest.NewRecorder()

			mux.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if called := len(*calls) > 0; called != tt.wantCalled {
				t.Fatalf("claim called = %v, want %v", called, tt.wantCalled)
			}
			if tt.wantStatus != http.StatusOK {
				var body map[string]string
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["error"] == "" {
					t.Errorf("expected JSON error body, got %s", rec.Body.String())
				}
				if tt.wantStatus == http.StatusInternalServerError && strings.Contains(body["error"], "boom") {
					t.Errorf("internal error leaked to client: %s", body["error"])
				}
			}
		})
	}
}

func TestClaimHandlerPassesTrimmedAgentAndReturnsRoom(t *testing.T) {
	claimedAt := created.Add(6 * time.Minute)
	want := Room{ID: "r1", Name: "Cust", Platform: "whatsapp", Status: "assigned", CreatedAt: created,
		AssignedAgent: "Agent Demo", ClaimedAt: &claimedAt, SLABreached: true}
	mux, calls := newClaimServer(func(context.Context, string, string) (Room, error) { return want, nil })
	req := httptest.NewRequest(http.MethodPost, "/api/rooms/r1/claim", strings.NewReader(`{"agentName":"  Agent Demo "}`))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if got := (*calls)[0]; got != (claimCall{id: "r1", agentName: "Agent Demo"}) {
		t.Errorf("claim called with %+v", got)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["status"] != "assigned" || got["assignedAgent"] != "Agent Demo" || got["slaBreached"] != true || got["claimedAt"] == nil {
		t.Errorf("unexpected response body: %s", rec.Body.String())
	}
}
