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

type fakeNoteStore struct {
	notes   []Note
	failErr error
}

func (f *fakeNoteStore) CreateNote(_ context.Context, roomID, content string, isImportant bool) (Note, error) {
	if f.failErr != nil {
		return Note{}, f.failErr
	}
	n := Note{ID: fmt.Sprint(len(f.notes) + 1), RoomID: roomID, Content: content, IsImportant: isImportant, CreatedAt: time.Now().UTC()}
	f.notes = append(f.notes, n)
	return n, nil
}

func (f *fakeNoteStore) ListNotes(_ context.Context, roomID string) ([]Note, error) {
	if f.failErr != nil {
		return nil, f.failErr
	}
	out := []Note{}
	for _, n := range f.notes {
		if n.RoomID == roomID {
			out = append(out, n)
		}
	}
	return out, nil
}

func newTestMux(store NoteStore) *http.ServeMux {
	h := NewNoteHandler(store, func(_ context.Context, id string) (bool, error) {
		if id == "broken" {
			return false, errors.New("firestore down")
		}
		return id == "room1", nil
	})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/rooms/{id}/notes", h.List)
	mux.HandleFunc("POST /api/rooms/{id}/notes", h.Create)
	return mux
}

func TestNormalizeNoteContent(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{"empty", "", "", true},
		{"whitespace only", "  \n\t ", "", true},
		{"trimmed", "  hello  ", "hello", false},
		{"exactly max ascii", strings.Repeat("a", MaxNoteLength), strings.Repeat("a", MaxNoteLength), false},
		{"one over max", strings.Repeat("a", MaxNoteLength+1), "", true},
		{"max counted in characters not bytes", strings.Repeat("é", MaxNoteLength), strings.Repeat("é", MaxNoteLength), false},
		{"emoji over max", strings.Repeat("📍", MaxNoteLength+1), "", true},
		{"nul byte", "a\x00b", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeNoteContent(tt.in)
			if (err != nil) != tt.wantErr || got != tt.want {
				t.Errorf("normalizeNoteContent() = %q, %v; want %q, wantErr=%v", got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestCreateNote(t *testing.T) {
	tests := []struct {
		name       string
		room       string
		body       string
		storeErr   error
		wantStatus int
	}{
		{"valid", "room1", `{"content":"VIP customer","isImportant":true}`, nil, http.StatusCreated},
		{"isImportant optional", "room1", `{"content":"note"}`, nil, http.StatusCreated},
		{"missing content", "room1", `{"isImportant":true}`, nil, http.StatusBadRequest},
		{"too long", "room1", `{"content":"` + strings.Repeat("x", 501) + `"}`, nil, http.StatusBadRequest},
		{"wrong isImportant type", "room1", `{"content":"x","isImportant":"yes"}`, nil, http.StatusBadRequest},
		{"wrong content type", "room1", `{"content":42}`, nil, http.StatusBadRequest},
		{"malformed json", "room1", `{`, nil, http.StatusBadRequest},
		{"unknown room", "nope", `{"content":"x"}`, nil, http.StatusNotFound},
		{"room lookup fails", "broken", `{"content":"x"}`, nil, http.StatusInternalServerError},
		{"store fails", "room1", `{"content":"x"}`, errors.New("db down"), http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeNoteStore{failErr: tt.storeErr}
			req := httptest.NewRequest(http.MethodPost, "/api/rooms/"+tt.room+"/notes", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			newTestMux(store).ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantStatus != http.StatusCreated {
				if len(store.notes) != 0 {
					t.Errorf("note stored despite error response")
				}
				return
			}
			var got Note
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if got.RoomID != "room1" || got.Content == "" || got.CreatedAt.IsZero() {
				t.Errorf("unexpected note %+v", got)
			}
		})
	}
}

func TestListNotes(t *testing.T) {
	store := &fakeNoteStore{notes: []Note{
		{ID: "1", RoomID: "room1", Content: "a"},
		{ID: "2", RoomID: "other", Content: "b"},
	}}
	mux := newTestMux(store)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/rooms/room1/notes", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []Note
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 || got[0].ID != "1" {
		t.Errorf("got %+v, want only note 1", got)
	}

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/rooms/nope/notes", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown room status = %d, want 404", rec.Code)
	}
}
