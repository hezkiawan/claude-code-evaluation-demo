package handlers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

// Note is the API representation of an Internal Note: a private, append-only
// annotation on a Room that is never part of the Message stream.
type Note struct {
	ID        string    `json:"id" firestore:"-"`
	Content   string    `json:"content" firestore:"content"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}

// NoteStore persists Internal Notes under their Room.
type NoteStore interface {
	RoomExists(ctx context.Context, roomID string) (bool, error)
	// CreateNote stores the note and returns it with its assigned ID.
	CreateNote(ctx context.Context, roomID string, note Note) (Note, error)
	// ListNotes returns the Room's notes newest first, ties broken by ID descending.
	ListNotes(ctx context.Context, roomID string) ([]Note, error)
}

type NoteHandler struct {
	store NoteStore
}

func NewNoteHandler(store NoteStore) *NoteHandler {
	return &NoteHandler{store: store}
}

// Register mounts the notes routes on mux.
func (h *NoteHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/rooms/{id}/notes", h.Create)
	mux.HandleFunc("GET /api/rooms/{id}/notes", h.List)
}

// Create handles POST /api/rooms/{id}/notes.
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	content, msg := validateNoteBody(body)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	roomID := r.PathValue("id")
	if !h.requireRoom(w, r, roomID, "failed to create note") {
		return
	}
	note, err := h.store.CreateNote(r.Context(), roomID, Note{
		Content:   content,
		CreatedAt: time.Now().UTC(),
	})
	if err != nil {
		log.Printf("create note in room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, "failed to create note")
		return
	}
	WriteJSON(w, http.StatusCreated, note)
}

// List handles GET /api/rooms/{id}/notes.
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	if !h.requireRoom(w, r, roomID, "failed to fetch notes") {
		return
	}
	notes, err := h.store.ListNotes(r.Context(), roomID)
	if err != nil {
		log.Printf("list notes in room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch notes")
		return
	}
	if notes == nil {
		notes = []Note{}
	}
	WriteJSON(w, http.StatusOK, notes)
}

// requireRoom writes a 404 (or a 500 with failMsg on store failure) and returns
// false unless the Room exists.
func (h *NoteHandler) requireRoom(w http.ResponseWriter, r *http.Request, roomID, failMsg string) bool {
	exists, err := h.store.RoomExists(r.Context(), roomID)
	if err != nil {
		log.Printf("check room %s: %v", roomID, err)
		writeError(w, http.StatusInternalServerError, failMsg)
		return false
	}
	if !exists {
		writeError(w, http.StatusNotFound, "room not found")
		return false
	}
	return true
}

// validateNoteBody parses a create-note request body and returns the trimmed
// content, or a client-facing error message.
func validateNoteBody(body []byte) (content string, errMsg string) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return "", "invalid JSON body"
	}
	raw, ok := fields["content"]
	if !ok {
		return "", "content is required"
	}
	if err := json.Unmarshal(raw, &content); err != nil {
		return "", "content must be a string"
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return "", "content is required"
	}
	return content, ""
}

// sortNotesNewestFirst orders notes by createdAt descending, ties broken by ID
// descending so the order is deterministic.
func sortNotesNewestFirst(notes []Note) {
	sort.Slice(notes, func(i, j int) bool {
		if !notes[i].CreatedAt.Equal(notes[j].CreatedAt) {
			return notes[i].CreatedAt.After(notes[j].CreatedAt)
		}
		return notes[i].ID > notes[j].ID
	})
}
