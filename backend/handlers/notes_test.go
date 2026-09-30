package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fakeNoteStore is an in-memory NoteStore.
type fakeNoteStore struct {
	rooms  map[string]bool
	notes  map[string][]Note
	nextID int
	// roomErr fails RoomExists; notesErr fails CreateNote and ListNotes.
	roomErr, notesErr error
}

func newFakeNoteStore(roomIDs ...string) *fakeNoteStore {
	s := &fakeNoteStore{rooms: map[string]bool{}, notes: map[string][]Note{}}
	for _, id := range roomIDs {
		s.rooms[id] = true
	}
	return s
}

func (s *fakeNoteStore) RoomExists(_ context.Context, roomID string) (bool, error) {
	if s.roomErr != nil {
		return false, s.roomErr
	}
	return s.rooms[roomID], nil
}

func (s *fakeNoteStore) CreateNote(_ context.Context, roomID string, n Note) (Note, error) {
	if s.notesErr != nil {
		return Note{}, s.notesErr
	}
	s.nextID++
	n.ID = fmt.Sprintf("note-%03d", s.nextID)
	s.notes[roomID] = append(s.notes[roomID], n)
	return n, nil
}

func (s *fakeNoteStore) ListNotes(_ context.Context, roomID string) ([]Note, error) {
	if s.notesErr != nil {
		return nil, s.notesErr
	}
	out := append([]Note(nil), s.notes[roomID]...)
	sortNotesNewestFirst(out)
	return out, nil
}

func newNotesServer(store NoteStore) *http.ServeMux {
	mux := http.NewServeMux()
	NewNoteHandler(store).Register(mux)
	return mux
}

func serveNotes(t *testing.T, mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

type noteJSON struct {
	ID          string `json:"id"`
	Content     string `json:"content"`
	IsImportant bool   `json:"isImportant"`
	CreatedAt   string `json:"createdAt"`
}

func TestCreateNoteTrimsContentAndReturnsCreated(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore("room-1"))
	before := time.Now().UTC()

	rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes",
		`{"content": "  hello  ", "createdAt": "2000-01-01T00:00:00Z"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body %s", rec.Code, rec.Body)
	}
	var got noteJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID == "" {
		t.Error("id is empty")
	}
	if got.Content != "hello" {
		t.Errorf("content = %q, want %q", got.Content, "hello")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, got.CreatedAt)
	if err != nil {
		t.Fatalf("createdAt %q is not RFC 3339: %v", got.CreatedAt, err)
	}
	if createdAt.Before(before.Add(-time.Second)) || createdAt.Location() != time.UTC {
		t.Errorf("createdAt = %v, want server-set current UTC time", createdAt)
	}
}

func decodeNotes(t *testing.T, rec *httptest.ResponseRecorder) []noteJSON {
	t.Helper()
	var got []noteJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode %s: %v", rec.Body, err)
	}
	return got
}

func TestListNotesIncludesCreatedNote(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore("room-1"))
	created := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", `{"content": "escalated to billing"}`)
	var note noteJSON
	json.Unmarshal(created.Body.Bytes(), &note)

	rec := serveNotes(t, mux, http.MethodGet, "/api/rooms/room-1/notes", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", rec.Code, rec.Body)
	}
	got := decodeNotes(t, rec)
	if len(got) != 1 || got[0] != note {
		t.Errorf("notes = %+v, want [%+v]", got, note)
	}
}

func TestListNotesReturnsEmptyArrayForRoomWithoutNotes(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore("room-1"))

	rec := serveNotes(t, mux, http.MethodGet, "/api/rooms/room-1/notes", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := strings.TrimSpace(rec.Body.String()); body != "[]" {
		t.Errorf("body = %s, want []", body)
	}
}

func TestListNotesNewestFirstWithTiesByIDDescending(t *testing.T) {
	store := newFakeNoteStore("room-1")
	t0 := time.Date(2026, 9, 30, 7, 0, 0, 0, time.UTC)
	store.notes["room-1"] = []Note{
		{ID: "a", Content: "oldest", CreatedAt: t0},
		{ID: "c", Content: "newest", CreatedAt: t0.Add(2 * time.Minute)},
		{ID: "b", Content: "tie-low", CreatedAt: t0.Add(time.Minute)},
		{ID: "d", Content: "tie-high", CreatedAt: t0.Add(time.Minute)},
	}
	mux := newNotesServer(store)

	got := decodeNotes(t, serveNotes(t, mux, http.MethodGet, "/api/rooms/room-1/notes", ""))

	var order []string
	for _, n := range got {
		order = append(order, n.Content)
	}
	want := "newest,tie-high,tie-low,oldest"
	if strings.Join(order, ",") != want {
		t.Errorf("order = %v, want %s", order, want)
	}
}

func TestNotesEndpointsReturn404ForUnknownRoom(t *testing.T) {
	cases := []struct{ method, body string }{
		{http.MethodGet, ""},
		{http.MethodPost, `{"content": "hi"}`},
	}
	for _, tc := range cases {
		t.Run(tc.method, func(t *testing.T) {
			mux := newNotesServer(newFakeNoteStore("room-1"))

			rec := serveNotes(t, mux, tc.method, "/api/rooms/nope/notes", tc.body)

			assertError(t, rec, http.StatusNotFound)
			if msg := errorMessage(t, rec); msg != "room not found" {
				t.Errorf("error = %q, want %q", msg, "room not found")
			}
		})
	}
}

func errorMessage(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body %s: %v", rec.Body, err)
	}
	msg, ok := body["error"].(string)
	if !ok || msg == "" {
		t.Fatalf("body %s has no string error field", rec.Body)
	}
	return msg
}

func assertError(t *testing.T, rec *httptest.ResponseRecorder, status int) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d; body %s", rec.Code, status, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	errorMessage(t, rec)
}

func TestCreateNoteRejectsInvalidBody(t *testing.T) {
	cases := map[string]string{
		"malformed JSON":     `{"content": "hi"`,
		"non-object JSON":    `["hi"]`,
		"missing content":    `{}`,
		"numeric content":    `{"content": 42}`,
		"empty content":      `{"content": ""}`,
		"whitespace content": `{"content": " \t\n  "}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			store := newFakeNoteStore("room-1")
			mux := newNotesServer(store)

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", body)

			assertError(t, rec, http.StatusBadRequest)
			if len(store.notes["room-1"]) != 0 {
				t.Error("invalid note was stored")
			}
		})
	}
}

func TestCreateNoteValidatesBodyBeforeCheckingRoom(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore())

	rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/nope/notes", `{"content": "   "}`)

	assertError(t, rec, http.StatusBadRequest)
}

func TestNotesEndpointsReturn500WithoutDetailsOnStoreFailure(t *testing.T) {
	storeErr := errors.New("firestore: secret internal detail")
	cases := map[string]struct {
		method, body string
		fail         func(*fakeNoteStore)
	}{
		"GET room check":  {http.MethodGet, "", func(s *fakeNoteStore) { s.roomErr = storeErr }},
		"GET list":        {http.MethodGet, "", func(s *fakeNoteStore) { s.notesErr = storeErr }},
		"POST room check": {http.MethodPost, `{"content": "hi"}`, func(s *fakeNoteStore) { s.roomErr = storeErr }},
		"POST create":     {http.MethodPost, `{"content": "hi"}`, func(s *fakeNoteStore) { s.notesErr = storeErr }},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			store := newFakeNoteStore("room-1")
			tc.fail(store)
			mux := newNotesServer(store)

			rec := serveNotes(t, mux, tc.method, "/api/rooms/room-1/notes", tc.body)

			assertError(t, rec, http.StatusInternalServerError)
			if strings.Contains(rec.Body.String(), "secret") {
				t.Errorf("response leaks store error: %s", rec.Body)
			}
		})
	}
}

func TestCreateNoteContentLengthIsCountedInCodePointsAfterTrimming(t *testing.T) {
	cases := map[string]struct {
		content string
		status  int
	}{
		"500 ASCII":                   {strings.Repeat("a", 500), http.StatusCreated},
		"501 ASCII":                   {strings.Repeat("a", 501), http.StatusBadRequest},
		"500 emoji":                   {strings.Repeat("😀", 500), http.StatusCreated},
		"501 emoji":                   {strings.Repeat("😀", 501), http.StatusBadRequest},
		"composite emoji code points": {strings.Repeat("👍🏽", 250), http.StatusCreated},
		"composite emoji over limit":  {strings.Repeat("👍🏽", 250) + "a", http.StatusBadRequest},
		"over 500 only before trim":   {" \t\n" + strings.Repeat("a", 500) + "\u00a0\u2003 \n", http.StatusCreated},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			store := newFakeNoteStore("room-1")
			mux := newNotesServer(store)
			body, _ := json.Marshal(map[string]string{"content": tc.content})

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", string(body))

			if tc.status == http.StatusBadRequest {
				assertError(t, rec, http.StatusBadRequest)
				if msg := errorMessage(t, rec); msg != "content is required (1-500 characters)" {
					t.Errorf("error = %q, want %q", msg, "content is required (1-500 characters)")
				}
				if len(store.notes["room-1"]) != 0 {
					t.Error("over-limit note was stored")
				}
				return
			}
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d; body %s", rec.Code, tc.status, rec.Body)
			}
			var got noteJSON
			json.Unmarshal(rec.Body.Bytes(), &got)
			if want := strings.TrimSpace(tc.content); got.Content != want {
				t.Errorf("content = %q, want trimmed %q", got.Content, want)
			}
		})
	}
}

func TestCreateNoteRejectsNullAndNonStringContent(t *testing.T) {
	for name, body := range map[string]string{
		"null content":    `{"content": null}`,
		"boolean content": `{"content": true}`,
		"object content":  `{"content": {"text": "hi"}}`,
		"array content":   `{"content": ["hi"]}`,
	} {
		t.Run(name, func(t *testing.T) {
			mux := newNotesServer(newFakeNoteStore("room-1"))

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", body)

			assertError(t, rec, http.StatusBadRequest)
			if msg := errorMessage(t, rec); msg != "content must be a string" {
				t.Errorf("error = %q, want %q", msg, "content must be a string")
			}
		})
	}
}

func TestCreateNoteRejectsEmptyContentWithLengthRuleMessage(t *testing.T) {
	for name, body := range map[string]string{
		"missing":    `{}`,
		"empty":      `{"content": ""}`,
		"whitespace": `{"content": " \t\n\u00a0 "}`,
	} {
		t.Run(name, func(t *testing.T) {
			mux := newNotesServer(newFakeNoteStore("room-1"))

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", body)

			assertError(t, rec, http.StatusBadRequest)
			if msg := errorMessage(t, rec); msg != "content is required (1-500 characters)" {
				t.Errorf("error = %q, want %q", msg, "content is required (1-500 characters)")
			}
		})
	}
}

func TestCreateNoteIgnoresUnknownFields(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore("room-1"))

	rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes",
		`{"content": "hi", "author": "someone", "extra": {"nested": [1, 2]}}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body %s", rec.Code, rec.Body)
	}
}

func TestCreateNoteRejectsBodyOver1MB(t *testing.T) {
	store := newFakeNoteStore("room-1")
	mux := newNotesServer(store)
	body := `{"content": "hi", "padding": "` + strings.Repeat("x", 1<<20) + `"}`

	rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", body)

	assertError(t, rec, http.StatusBadRequest)
	if len(store.notes["room-1"]) != 0 {
		t.Error("oversized request was stored")
	}
}

func TestCreateNoteDefaultsIsImportantToFalse(t *testing.T) {
	mux := newNotesServer(newFakeNoteStore("room-1"))

	rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes", `{"content": "hi"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body %s", rec.Code, rec.Body)
	}
	var got map[string]any
	json.Unmarshal(rec.Body.Bytes(), &got)
	if v, ok := got["isImportant"]; !ok || v != false {
		t.Errorf("isImportant = %v (present %v), want false", v, ok)
	}
}

func TestCreateNoteIsImportantRoundTripsThroughList(t *testing.T) {
	for _, flag := range []bool{true, false} {
		t.Run(fmt.Sprint(flag), func(t *testing.T) {
			mux := newNotesServer(newFakeNoteStore("room-1"))

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes",
				fmt.Sprintf(`{"content": "hi", "isImportant": %v}`, flag))

			if rec.Code != http.StatusCreated {
				t.Fatalf("status = %d, want 201; body %s", rec.Code, rec.Body)
			}
			var created noteJSON
			json.Unmarshal(rec.Body.Bytes(), &created)
			if created.IsImportant != flag {
				t.Errorf("created isImportant = %v, want %v", created.IsImportant, flag)
			}
			listed := decodeNotes(t, serveNotes(t, mux, http.MethodGet, "/api/rooms/room-1/notes", ""))
			if len(listed) != 1 || listed[0].IsImportant != flag {
				t.Errorf("listed = %+v, want one note with isImportant %v", listed, flag)
			}
		})
	}
}

func TestListNotesReturnsIsImportantFalseForNotesStoredWithoutIt(t *testing.T) {
	store := newFakeNoteStore("room-1")
	store.notes["room-1"] = []Note{{ID: "a", Content: "legacy", CreatedAt: time.Now().UTC()}}
	mux := newNotesServer(store)

	rec := serveNotes(t, mux, http.MethodGet, "/api/rooms/room-1/notes", "")

	var got []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got) != 1 {
		t.Fatalf("notes = %s, want one", rec.Body)
	}
	if v, ok := got[0]["isImportant"]; !ok || v != false {
		t.Errorf("isImportant = %v (present %v), want false", v, ok)
	}
}

func TestCreateNoteRejectsNonBooleanIsImportant(t *testing.T) {
	for name, value := range map[string]string{
		"null":   `null`,
		"string": `"true"`,
		"number": `1`,
	} {
		t.Run(name, func(t *testing.T) {
			store := newFakeNoteStore("room-1")
			mux := newNotesServer(store)

			rec := serveNotes(t, mux, http.MethodPost, "/api/rooms/room-1/notes",
				`{"content": "hi", "isImportant": `+value+`}`)

			assertError(t, rec, http.StatusBadRequest)
			if msg := errorMessage(t, rec); msg != "isImportant must be a boolean" {
				t.Errorf("error = %q, want %q", msg, "isImportant must be a boolean")
			}
			if len(store.notes["room-1"]) != 0 {
				t.Error("invalid note was stored")
			}
		})
	}
}
