package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

const (
	notesCollection = "notes"
	maxNoteLength   = 500
)

// Note is an internal, agent-only note stored in rooms/{roomId}/notes.
type Note struct {
	ID          string    `json:"id" firestore:"-"`
	Content     string    `json:"content" firestore:"content"`
	IsImportant bool      `json:"isImportant" firestore:"isImportant"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// createNoteRequest keeps isImportant raw so a non-boolean value (including
// null) can be rejected instead of silently coerced to false.
type createNoteRequest struct {
	Content     *string         `json:"content"`
	IsImportant json.RawMessage `json:"isImportant"`
}

// parseCreateNote validates a POST body and returns the trimmed content and
// importance flag. The returned error message is safe to show to clients.
func parseCreateNote(body []byte) (content string, important bool, err error) {
	var req createNoteRequest
	if err := json.Unmarshal(body, &req); err != nil {
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) && typeErr.Field == "content" {
			return "", false, errors.New("content must be a string")
		}
		return "", false, errors.New("invalid JSON body")
	}
	if req.Content == nil {
		return "", false, errors.New("content is required")
	}
	content = strings.TrimSpace(*req.Content)
	if n := utf8.RuneCountInString(content); n == 0 || n > maxNoteLength {
		return "", false, errors.New("content must be 1 to 500 characters")
	}
	if req.IsImportant != nil {
		switch string(bytes.TrimSpace(req.IsImportant)) {
		case "true":
			important = true
		case "false":
		default:
			return "", false, errors.New("isImportant must be a boolean")
		}
	}
	return content, important, nil
}

type NoteHandler struct {
	fs *firestore.Client
}

func NewNoteHandler(fs *firestore.Client) *NoteHandler {
	return &NoteHandler{fs: fs}
}

// roomRef resolves {id} and writes a 404 (or 500) if the room doesn't exist.
func (h *NoteHandler) roomRef(w http.ResponseWriter, r *http.Request) (*firestore.DocumentRef, bool) {
	ref := h.fs.Collection(roomsCollection).Doc(r.PathValue("id"))
	snap, err := ref.Get(r.Context())
	if snap != nil && !snap.Exists() {
		writeError(w, http.StatusNotFound, "room not found")
		return nil, false
	}
	if err != nil {
		log.Printf("get room %s: %v", ref.ID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch room")
		return nil, false
	}
	return ref, true
}

// Create handles POST /api/rooms/{id}/notes.
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	room, ok := h.roomRef(w, r)
	if !ok {
		return
	}

	var raw json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	content, important, err := parseCreateNote(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ref := room.Collection(notesCollection).NewDoc()
	wr, err := ref.Create(r.Context(), map[string]any{
		"content":     content,
		"isImportant": important,
		"createdAt":   firestore.ServerTimestamp,
	})
	if err != nil {
		log.Printf("create note in room %s: %v", room.ID, err)
		writeError(w, http.StatusInternalServerError, "failed to create note")
		return
	}
	// The server timestamp resolves to the commit time, which is UpdateTime.
	WriteJSON(w, http.StatusCreated, Note{
		ID:          ref.ID,
		Content:     content,
		IsImportant: important,
		CreatedAt:   wr.UpdateTime.UTC(),
	})
}

// List handles GET /api/rooms/{id}/notes, newest first.
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	room, ok := h.roomRef(w, r)
	if !ok {
		return
	}

	notes := make([]Note, 0)
	iter := room.Collection(notesCollection).OrderBy("createdAt", firestore.Desc).Documents(r.Context())
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("list notes in room %s: %v", room.ID, err)
			writeError(w, http.StatusInternalServerError, "failed to fetch notes")
			return
		}
		var note Note
		if err := doc.DataTo(&note); err != nil {
			log.Printf("decode note %s: %v", doc.Ref.ID, err)
			continue
		}
		note.ID = doc.Ref.ID
		notes = append(notes, note)
	}
	WriteJSON(w, http.StatusOK, notes)
}
