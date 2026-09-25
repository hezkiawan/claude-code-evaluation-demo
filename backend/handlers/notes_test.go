package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func TestNewNote(t *testing.T) {
	tests := []struct {
		name          string
		req           createNoteRequest
		wantErr       bool
		wantContent   string
		wantImportant bool
	}{
		{"plain note", createNoteRequest{Content: strPtr("Customer prefers email")}, false, "Customer prefers email", false},
		{"important note", createNoteRequest{Content: strPtr("VIP"), IsImportant: boolPtr(true)}, false, "VIP", true},
		{"explicitly not important", createNoteRequest{Content: strPtr("x"), IsImportant: boolPtr(false)}, false, "x", false},
		{"content is trimmed", createNoteRequest{Content: strPtr("  hi \n")}, false, "hi", false},
		{"exactly 500 chars", createNoteRequest{Content: strPtr(strings.Repeat("a", 500))}, false, strings.Repeat("a", 500), false},
		{"500 multi-byte runes", createNoteRequest{Content: strPtr(strings.Repeat("é", 500))}, false, strings.Repeat("é", 500), false},
		{"missing content", createNoteRequest{}, true, "", false},
		{"empty content", createNoteRequest{Content: strPtr("")}, true, "", false},
		{"whitespace-only content", createNoteRequest{Content: strPtr("   \t\n")}, true, "", false},
		{"501 chars", createNoteRequest{Content: strPtr(strings.Repeat("a", 501))}, true, "", false},
		{"501 multi-byte runes", createNoteRequest{Content: strPtr(strings.Repeat("é", 501))}, true, "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := newNote(tt.req, testNow)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got note %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Content != tt.wantContent {
				t.Errorf("Content = %q, want %q", got.Content, tt.wantContent)
			}
			if got.IsImportant != tt.wantImportant {
				t.Errorf("IsImportant = %v, want %v", got.IsImportant, tt.wantImportant)
			}
			if !got.CreatedAt.Equal(testNow) {
				t.Errorf("CreatedAt = %v, want %v", got.CreatedAt, testNow)
			}
		})
	}
}

type fakeNoteStore struct {
	notes     []Note
	addErr    error
	listErr   error
	gotRoomID string
	gotNote   Note
	addCalled bool
}

func (f *fakeNoteStore) Add(_ context.Context, roomID string, note Note) (Note, error) {
	f.addCalled, f.gotRoomID, f.gotNote = true, roomID, note
	if f.addErr != nil {
		return Note{}, f.addErr
	}
	note.ID = "note1"
	return note, nil
}

func (f *fakeNoteStore) List(_ context.Context, roomID string) ([]Note, error) {
	f.gotRoomID = roomID
	return f.notes, f.listErr
}

func serveNotes(t *testing.T, store *fakeNoteStore, method, id string, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()
	h := &RoomHandler{notes: store, now: func() time.Time { return testNow }}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/rooms/{id}/notes", h.CreateNote)
	mux.HandleFunc("GET /api/rooms/{id}/notes", h.ListNotes)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, "/api/rooms/"+id+"/notes", body))
	return rec
}

func TestCreateNoteHandlerSuccess(t *testing.T) {
	store := &fakeNoteStore{}

	rec := serveNotes(t, store, http.MethodPost, "room1",
		strings.NewReader(`{"content":"  Wants a refund  ","isImportant":true}`))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body)
	}
	if store.gotRoomID != "room1" {
		t.Errorf("store got room id %q, want room1", store.gotRoomID)
	}
	want := Note{Content: "Wants a refund", IsImportant: true, CreatedAt: testNow}
	if store.gotNote != want {
		t.Errorf("store got note %+v, want %+v", store.gotNote, want)
	}
	body := decodeBody[map[string]any](t, rec)
	if body["id"] != "note1" || body["content"] != "Wants a refund" || body["isImportant"] != true {
		t.Errorf("unexpected body: %v", body)
	}
	if body["createdAt"] != testNow.Format(time.RFC3339) {
		t.Errorf("createdAt = %v, want %s", body["createdAt"], testNow.Format(time.RFC3339))
	}
}

func TestCreateNoteHandlerRejectsBadPayloads(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"malformed JSON", `{"content":`},
		{"missing content", `{"isImportant":true}`},
		{"blank content", `{"content":"   "}`},
		{"content too long", `{"content":"` + strings.Repeat("a", 501) + `"}`},
		{"content wrong type", `{"content":42}`},
		{"isImportant wrong type", `{"content":"hi","isImportant":"yes"}`},
		{"unknown field", `{"content":"hi","author":"mallory"}`},
		{"trailing data", `{"content":"hi"}{"content":"again"}`},
		{"oversized body", `{"content":"` + strings.Repeat("a", 64<<10) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeNoteStore{}
			rec := serveNotes(t, store, http.MethodPost, "room1", strings.NewReader(tt.body))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body)
			}
			if decodeBody[map[string]string](t, rec)["error"] == "" {
				t.Error("expected an error message")
			}
			if store.addCalled {
				t.Error("store should not be called for an invalid payload")
			}
		})
	}
}

func TestCreateNoteHandlerStoreErrors(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{"room not found", ErrRoomNotFound, http.StatusNotFound, "room not found"},
		{"wrapped not found", errors.Join(errors.New("tx"), ErrRoomNotFound), http.StatusNotFound, "room not found"},
		{"storage failure hides details", errors.New("rpc error: secret internals"), http.StatusInternalServerError, "failed to create note"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serveNotes(t, &fakeNoteStore{addErr: tt.err}, http.MethodPost, "room1",
				strings.NewReader(`{"content":"hi"}`))
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := decodeBody[map[string]string](t, rec)["error"]; got != tt.wantMsg {
				t.Errorf("error = %q, want %q", got, tt.wantMsg)
			}
		})
	}
}

func TestListNotesHandler(t *testing.T) {
	notes := []Note{
		{ID: "n2", Content: "newer", IsImportant: true, CreatedAt: testNow},
		{ID: "n1", Content: "older", CreatedAt: testNow.Add(-time.Hour)},
	}
	store := &fakeNoteStore{notes: notes}

	rec := serveNotes(t, store, http.MethodGet, "room1", nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body)
	}
	if store.gotRoomID != "room1" {
		t.Errorf("store got room id %q, want room1", store.gotRoomID)
	}
	got := decodeBody[[]Note](t, rec)
	if len(got) != 2 || got[0].ID != "n2" || !got[0].IsImportant || got[1].ID != "n1" {
		t.Errorf("unexpected notes: %+v", got)
	}
}

func TestListNotesHandlerEmptyIsArray(t *testing.T) {
	rec := serveNotes(t, &fakeNoteStore{notes: nil}, http.MethodGet, "room1", nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("body = %s, want []", got)
	}
}

func TestListNotesHandlerErrors(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{"room not found", ErrRoomNotFound, http.StatusNotFound, "room not found"},
		{"storage failure hides details", errors.New("rpc error: secret internals"), http.StatusInternalServerError, "failed to fetch notes"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serveNotes(t, &fakeNoteStore{listErr: tt.err}, http.MethodGet, "room1", nil)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := decodeBody[map[string]string](t, rec)["error"]; got != tt.wantMsg {
				t.Errorf("error = %q, want %q", got, tt.wantMsg)
			}
		})
	}
}

func TestNotesHandlersRejectInvalidRoomIDs(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		for _, id := range []string{"a%2Fb", "__reserved__", strings.Repeat("a", 129)} {
			t.Run(method+" "+id[:min(len(id), 12)], func(t *testing.T) {
				store := &fakeNoteStore{}
				rec := serveNotes(t, store, method, id, strings.NewReader(`{"content":"hi"}`))
				if rec.Code != http.StatusBadRequest {
					t.Fatalf("status = %d, want 400", rec.Code)
				}
				if store.gotRoomID != "" {
					t.Error("store should not be called for an invalid id")
				}
			})
		}
	}
}
