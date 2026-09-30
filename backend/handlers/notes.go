package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const maxNoteLength = 500 // in Unicode characters (runes), after trimming

// Note is an internal, agent-only note stored in rooms/{roomId}/notes.
type Note struct {
	ID          string    `json:"id" firestore:"-"`
	Content     string    `json:"content" firestore:"content"`
	IsImportant bool      `json:"isImportant" firestore:"isImportant"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// NoteStore is the persistence boundary for notes, so handlers can be tested
// without Firestore.
type NoteStore interface {
	RoomExists(ctx context.Context, roomID string) (bool, error)
	AddNote(ctx context.Context, roomID string, note Note) (Note, error)
	// ListNotes returns the room's notes, newest first.
	ListNotes(ctx context.Context, roomID string) ([]Note, error)
}

// Raw fields let us tell a missing field apart from one with the wrong type.
type createNoteRequest struct {
	Content     json.RawMessage `json:"content"`
	IsImportant json.RawMessage `json:"isImportant"`
}

type NoteHandler struct {
	store NoteStore
}

func NewNoteHandler(store NoteStore) *NoteHandler {
	return &NoteHandler{store: store}
}

// Create handles POST /api/rooms/{id}/notes.
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	if !h.requireRoom(w, r, roomID) {
		return
	}

	var req createNoteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	content, isImportant, err := validateCreateNote(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	note, err := h.store.AddNote(r.Context(), roomID, Note{
		Content:     content,
		IsImportant: isImportant,
		CreatedAt:   time.Now().UTC(),
	})
	if err != nil {
		log.Printf("create note in room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, "failed to create note")
		return
	}
	WriteJSON(w, http.StatusCreated, note)
}

// List handles GET /api/rooms/{id}/notes, newest first.
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	if !h.requireRoom(w, r, roomID) {
		return
	}

	notes, err := h.store.ListNotes(r.Context(), roomID)
	if err != nil {
		log.Printf("list notes in room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch notes")
		return
	}
	if notes == nil {
		notes = make([]Note, 0)
	}
	WriteJSON(w, http.StatusOK, notes)
}

// requireRoom writes a 404/500 and returns false unless the room exists.
func (h *NoteHandler) requireRoom(w http.ResponseWriter, r *http.Request, roomID string) bool {
	exists, err := h.store.RoomExists(r.Context(), roomID)
	if err != nil {
		log.Printf("look up room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, "failed to look up room")
		return false
	}
	if !exists {
		writeError(w, http.StatusNotFound, "room not found")
		return false
	}
	return true
}

// validateCreateNote returns the trimmed content and importance flag, or an
// error whose message is safe to show the client.
func validateCreateNote(req createNoteRequest) (string, bool, error) {
	if isAbsentOrNull(req.Content) {
		return "", false, errors.New("content is required")
	}
	var content string
	if err := json.Unmarshal(req.Content, &content); err != nil {
		return "", false, errors.New("content must be a string")
	}
	content = strings.TrimSpace(content)
	if n := utf8.RuneCountInString(content); n < 1 || n > maxNoteLength {
		return "", false, errors.New("content must be 1-500 characters")
	}

	isImportant := false
	if len(req.IsImportant) > 0 {
		// Unmarshalling null into a bool is a silent no-op, so reject it explicitly.
		if isAbsentOrNull(req.IsImportant) || json.Unmarshal(req.IsImportant, &isImportant) != nil {
			return "", false, errors.New("isImportant must be a boolean")
		}
	}
	return content, isImportant, nil
}

func isAbsentOrNull(raw json.RawMessage) bool {
	return len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}
