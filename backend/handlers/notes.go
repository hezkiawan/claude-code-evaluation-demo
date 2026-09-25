package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// MaxNoteLength is the maximum note length in characters (not bytes).
const MaxNoteLength = 500

// Note is an internal, agent-only note attached to a room. It is stored in the
// room's `notes` subcollection; ID and RoomID come from the document path.
type Note struct {
	ID          string    `json:"id" firestore:"-"`
	RoomID      string    `json:"roomId" firestore:"-"`
	Content     string    `json:"content" firestore:"content"`
	IsImportant bool      `json:"isImportant" firestore:"isImportant"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// NoteStore persists notes. FirestoreNoteStore is the production implementation.
type NoteStore interface {
	CreateNote(ctx context.Context, roomID, content string, isImportant bool) (Note, error)
	ListNotes(ctx context.Context, roomID string) ([]Note, error)
}

// RoomExistsFunc reports whether a room with the given id exists.
type RoomExistsFunc func(ctx context.Context, id string) (bool, error)

type createNoteRequest struct {
	Content     string `json:"content"`
	IsImportant bool   `json:"isImportant"`
}

type NoteHandler struct {
	store      NoteStore
	roomExists RoomExistsFunc
}

func NewNoteHandler(store NoteStore, roomExists RoomExistsFunc) *NoteHandler {
	return &NoteHandler{store: store, roomExists: roomExists}
}

var errInvalidNote = errors.New("content is required (max 500 characters)")

// normalizeNoteContent trims surrounding whitespace and enforces the length
// bounds. NUL bytes are rejected as they have no place in a text note.
func normalizeNoteContent(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" || utf8.RuneCountInString(s) > MaxNoteLength || strings.ContainsRune(s, 0) {
		return "", errInvalidNote
	}
	return s, nil
}

// Create handles POST /api/rooms/{id}/notes.
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := h.requireRoom(w, r)
	if !ok {
		return
	}

	var req createNoteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	content, err := normalizeNoteContent(req.Content)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	note, err := h.store.CreateNote(r.Context(), id, content, req.IsImportant)
	if err != nil {
		log.Printf("create note for room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to create note")
		return
	}
	WriteJSON(w, http.StatusCreated, note)
}

// List handles GET /api/rooms/{id}/notes, newest first.
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := h.requireRoom(w, r)
	if !ok {
		return
	}

	notes, err := h.store.ListNotes(r.Context(), id)
	if err != nil {
		log.Printf("list notes for room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch notes")
		return
	}
	WriteJSON(w, http.StatusOK, notes)
}

// requireRoom writes an error response and returns ok=false unless the path's
// room id refers to an existing room.
func (h *NoteHandler) requireRoom(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "room id is required")
		return "", false
	}
	exists, err := h.roomExists(r.Context(), id)
	if err != nil {
		log.Printf("look up room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to look up room")
		return "", false
	}
	if !exists {
		writeError(w, http.StatusNotFound, errRoomNotFound.Error())
		return "", false
	}
	return id, true
}
