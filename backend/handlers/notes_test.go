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

// fakeNoteStore is an in-memory NoteStore for handler tests.
type fakeNoteStore struct {
	rooms   map[string]bool
	notes   map[string][]Note // newest first, as ListNotes must return them
	added   []Note
	failErr error
}

func newFakeStore(roomIDs ...string) *fakeNoteStore {
	s := &fakeNoteStore{rooms: map[string]bool{}, notes: map[string][]Note{}}
	for _, id := range roomIDs {
		s.rooms[id] = true
	}
	return s
}

func (s *fakeNoteStore) RoomExists(_ context.Context, roomID string) (bool, error) {
	if s.failErr != nil {
		return false, s.failErr
	}
	return s.rooms[roomID], nil
}

func (s *fakeNoteStore) AddNote(_ context.Context, roomID string, note Note) (Note, error) {
	if s.failErr != nil {
		return Note{}, s.failErr
	}
	note.ID = "note-" + roomID
	s.added = append(s.added, note)
	return note, nil
}

func (s *fakeNoteStore) ListNotes(_ context.Context, roomID string) ([]Note, error) {
	if s.failErr != nil {
		return nil, s.failErr
	}
	return s.notes[roomID], nil
}

func newNotesMux(store NoteStore) *http.ServeMux {
	h := NewNoteHandler(store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/rooms/{id}/notes", h.List)
	mux.HandleFunc("POST /api/rooms/{id}/notes", h.Create)
	return mux
}

func doRequest(t *testing.T, mux http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("error body is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body["error"] == "" {
		t.Fatalf("expected non-empty \"error\" field, got %q", rec.Body.String())
	}
	return body["error"]
}

func TestCreateNote_Success(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		wantContent   string
		wantImportant bool
	}{
		{"defaults isImportant to false", `{"content":"Customer prefers email"}`, "Customer prefers email", false},
		{"accepts isImportant true", `{"content":"VIP","isImportant":true}`, "VIP", true},
		{"accepts isImportant false", `{"content":"x","isImportant":false}`, "x", false},
		{"trims surrounding whitespace", "{\"content\":\"  \\n\\t hello world \\t\\n \"}", "hello world", false},
		{"accepts exactly 500 ASCII chars", `{"content":"` + strings.Repeat("a", 500) + `"}`, strings.Repeat("a", 500), false},
		{"counts emoji as one char each (500 emoji)", `{"content":"` + strings.Repeat("😀", 500) + `"}`, strings.Repeat("😀", 500), false},
		{"accepts 500 chars after trimming padding", `{"content":"   ` + strings.Repeat("b", 500) + `   "}`, strings.Repeat("b", 500), false},
		{"accepts a single character", `{"content":"k"}`, "k", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore("room1")
			before := time.Now().UTC()

			rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/room1/notes", tc.body)

			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			var got Note
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("response is not a note: %v", err)
			}
			if got.ID == "" {
				t.Error("expected note id in response")
			}
			if got.Content != tc.wantContent {
				t.Errorf("content = %q, want %q", got.Content, tc.wantContent)
			}
			if got.IsImportant != tc.wantImportant {
				t.Errorf("isImportant = %v, want %v", got.IsImportant, tc.wantImportant)
			}
			if got.CreatedAt.Before(before.Add(-time.Second)) || got.CreatedAt.After(time.Now().UTC().Add(time.Second)) {
				t.Errorf("createdAt = %v, want server time near %v", got.CreatedAt, before)
			}
			if len(store.added) != 1 || store.added[0].Content != tc.wantContent {
				t.Errorf("store received %+v, want one note with trimmed content", store.added)
			}
		})
	}
}

func TestCreateNote_ResponseUsesCamelCaseFields(t *testing.T) {
	rec := doRequest(t, newNotesMux(newFakeStore("room1")), http.MethodPost, "/api/rooms/room1/notes", `{"content":"hi"}`)

	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	for _, key := range []string{"id", "content", "isImportant", "createdAt"} {
		if _, ok := raw[key]; !ok {
			t.Errorf("response missing %q field: %s", key, rec.Body.String())
		}
	}
}

func TestCreateNote_ClientSuppliedCreatedAtIsIgnored(t *testing.T) {
	store := newFakeStore("room1")

	rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/room1/notes",
		`{"content":"hi","createdAt":"2000-01-01T00:00:00Z","id":"forged"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rec.Code)
	}
	if store.added[0].CreatedAt.Year() == 2000 {
		t.Error("createdAt must be set by the server, not the client")
	}
}

func TestCreateNote_InvalidInput(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantMsg string
	}{
		{"malformed JSON", `{"content":`, "invalid JSON body"},
		{"non-object body", `["hello"]`, "invalid JSON body"},
		{"empty body", ``, "invalid JSON body"},
		{"missing content", `{"isImportant":true}`, "content is required"},
		{"null content", `{"content":null}`, "content is required"},
		{"empty content", `{"content":""}`, "content must be 1-500 characters"},
		{"whitespace-only content", `{"content":"   \n\t  "}`, "content must be 1-500 characters"},
		{"501 ASCII chars", `{"content":"` + strings.Repeat("a", 501) + `"}`, "content must be 1-500 characters"},
		{"501 emoji", `{"content":"` + strings.Repeat("😀", 501) + `"}`, "content must be 1-500 characters"},
		{"numeric content", `{"content":123}`, "content must be a string"},
		{"boolean content", `{"content":true}`, "content must be a string"},
		{"object content", `{"content":{"text":"hi"}}`, "content must be a string"},
		{"isImportant as string", `{"content":"hi","isImportant":"true"}`, "isImportant must be a boolean"},
		{"isImportant as number", `{"content":"hi","isImportant":1}`, "isImportant must be a boolean"},
		{"isImportant as null", `{"content":"hi","isImportant":null}`, "isImportant must be a boolean"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore("room1")

			rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/room1/notes", tc.body)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
			}
			if msg := decodeError(t, rec); !strings.Contains(msg, tc.wantMsg) {
				t.Errorf("error = %q, want it to contain %q", msg, tc.wantMsg)
			}
			if len(store.added) != 0 {
				t.Errorf("invalid input must not be stored, got %+v", store.added)
			}
		})
	}
}

func TestCreateNote_OversizedBodyIsRejected(t *testing.T) {
	body := `{"content":"` + strings.Repeat("a", 2<<20) + `"}`

	rec := doRequest(t, newNotesMux(newFakeStore("room1")), http.MethodPost, "/api/rooms/room1/notes", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	decodeError(t, rec)
}

func TestCreateNote_RoomNotFound(t *testing.T) {
	store := newFakeStore("room1")

	rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/missing/notes", `{"content":"hi"}`)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if msg := decodeError(t, rec); msg != "room not found" {
		t.Errorf("error = %q, want %q", msg, "room not found")
	}
	if len(store.added) != 0 {
		t.Error("note must not be stored for a missing room")
	}
}

func TestCreateNote_RoomNotFoundTakesPrecedenceOverInvalidBody(t *testing.T) {
	rec := doRequest(t, newNotesMux(newFakeStore()), http.MethodPost, "/api/rooms/missing/notes", `{"content":""}`)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestCreateNote_StoreFailureReturns500WithoutLeakingDetails(t *testing.T) {
	store := newFakeStore("room1")
	store.failErr = errors.New("rpc error: secret internal detail")

	rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/room1/notes", `{"content":"hi"}`)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if msg := decodeError(t, rec); strings.Contains(msg, "secret") {
		t.Errorf("error leaks internal detail: %q", msg)
	}
}

func TestCreateNote_AddFailureReturns500(t *testing.T) {
	store := &addFailingStore{fakeNoteStore: newFakeStore("room1")}

	rec := doRequest(t, newNotesMux(store), http.MethodPost, "/api/rooms/room1/notes", `{"content":"hi"}`)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if msg := decodeError(t, rec); msg != "failed to create note" {
		t.Errorf("error = %q, want %q", msg, "failed to create note")
	}
}

// addFailingStore finds the room but fails on write.
type addFailingStore struct{ *fakeNoteStore }

func (s *addFailingStore) AddNote(context.Context, string, Note) (Note, error) {
	return Note{}, errors.New("write failed")
}

// listFailingStore finds the room but fails on read.
type listFailingStore struct{ *fakeNoteStore }

func (s *listFailingStore) ListNotes(context.Context, string) ([]Note, error) {
	return nil, errors.New("read failed")
}

func TestListNotes_ReturnsNotesNewestFirst(t *testing.T) {
	store := newFakeStore("room1")
	t0 := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	store.notes["room1"] = []Note{
		{ID: "n2", Content: "newer", IsImportant: true, CreatedAt: t0.Add(time.Hour)},
		{ID: "n1", Content: "older", CreatedAt: t0},
	}

	rec := doRequest(t, newNotesMux(store), http.MethodGet, "/api/rooms/room1/notes", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []Note
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("response is not a note array: %v", err)
	}
	if len(got) != 2 || got[0].ID != "n2" || got[1].ID != "n1" {
		t.Fatalf("got %+v, want [n2, n1]", got)
	}
	if !got[0].IsImportant || got[1].IsImportant {
		t.Errorf("isImportant not preserved: %+v", got)
	}
}

func TestListNotes_EmptyRoomReturnsEmptyArray(t *testing.T) {
	rec := doRequest(t, newNotesMux(newFakeStore("room1")), http.MethodGet, "/api/rooms/room1/notes", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := strings.TrimSpace(rec.Body.String()); body != "[]" {
		t.Errorf("body = %q, want []", body)
	}
}

func TestListNotes_RoomNotFound(t *testing.T) {
	rec := doRequest(t, newNotesMux(newFakeStore("room1")), http.MethodGet, "/api/rooms/missing/notes", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if msg := decodeError(t, rec); msg != "room not found" {
		t.Errorf("error = %q, want %q", msg, "room not found")
	}
}

func TestListNotes_StoreFailuresReturn500(t *testing.T) {
	existsFails := newFakeStore("room1")
	existsFails.failErr = errors.New("unavailable")

	for name, store := range map[string]NoteStore{
		"room lookup fails": existsFails,
		"list fails":        &listFailingStore{fakeNoteStore: newFakeStore("room1")},
	} {
		t.Run(name, func(t *testing.T) {
			rec := doRequest(t, newNotesMux(store), http.MethodGet, "/api/rooms/room1/notes", "")

			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500", rec.Code)
			}
			decodeError(t, rec)
		})
	}
}
