package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	notesCollection = "notes"
	// MaxNoteLength is the content limit in characters (runes), not bytes.
	MaxNoteLength = 500
	// maxNotesListed caps GET responses; notes are returned newest first.
	maxNotesListed = 200
	// Worst case for 500 runes is 12 bytes each (an escaped surrogate pair).
	maxNoteBodyBytes = 16 << 10
)

// Note is an internal agent note stored at rooms/{roomId}/notes/{noteId}.
type Note struct {
	ID          string    `json:"id" firestore:"-"`
	Content     string    `json:"content" firestore:"content"`
	IsImportant bool      `json:"isImportant" firestore:"isImportant"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// Pointers distinguish a missing field from its zero value.
type createNoteRequest struct {
	Content     *string `json:"content"`
	IsImportant *bool   `json:"isImportant"`
}

// noteStore persists notes under a room, returning ErrRoomNotFound when the
// room document does not exist.
type noteStore interface {
	Add(ctx context.Context, roomID string, note Note) (Note, error)
	List(ctx context.Context, roomID string) ([]Note, error)
}

// newNote validates req and builds the note to store at now.
func newNote(req createNoteRequest, now time.Time) (Note, error) {
	if req.Content == nil {
		return Note{}, errors.New("content is required")
	}
	content := strings.TrimSpace(*req.Content)
	if content == "" {
		return Note{}, errors.New("content is required")
	}
	if utf8.RuneCountInString(content) > MaxNoteLength {
		return Note{}, fmt.Errorf("content must be at most %d characters", MaxNoteLength)
	}
	return Note{
		Content:     content,
		IsImportant: req.IsImportant != nil && *req.IsImportant,
		CreatedAt:   now,
	}, nil
}

// CreateNote handles POST /api/rooms/{id}/notes.
func (h *RoomHandler) CreateNote(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validRoomID(id) {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxNoteBodyBytes))
	dec.DisallowUnknownFields()
	var req createNoteRequest
	if err := dec.Decode(&req); err != nil || dec.More() {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	note, err := newNote(req, h.now().UTC())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	created, err := h.notes.Add(r.Context(), id, note)
	switch {
	case errors.Is(err, ErrRoomNotFound):
		writeError(w, http.StatusNotFound, ErrRoomNotFound.Error())
	case err != nil:
		log.Printf("create note in room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to create note")
	default:
		WriteJSON(w, http.StatusCreated, created)
	}
}

// ListNotes handles GET /api/rooms/{id}/notes.
func (h *RoomHandler) ListNotes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validRoomID(id) {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}

	notes, err := h.notes.List(r.Context(), id)
	switch {
	case errors.Is(err, ErrRoomNotFound):
		writeError(w, http.StatusNotFound, ErrRoomNotFound.Error())
	case err != nil:
		log.Printf("list notes in room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch notes")
	default:
		if notes == nil {
			notes = []Note{}
		}
		WriteJSON(w, http.StatusOK, notes)
	}
}

type firestoreNoteStore struct {
	fs *firestore.Client
}

func (s firestoreNoteStore) Add(ctx context.Context, roomID string, note Note) (Note, error) {
	roomRef := s.fs.Collection(roomsCollection).Doc(roomID)
	noteRef := roomRef.Collection(notesCollection).NewDoc()
	// The room check and the write share a transaction so a note can't land
	// under a room deleted in between.
	err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if _, err := tx.Get(roomRef); err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrRoomNotFound
			}
			return err
		}
		return tx.Create(noteRef, note)
	})
	if err != nil {
		return Note{}, err
	}
	note.ID = noteRef.ID
	return note, nil
}

func (s firestoreNoteStore) List(ctx context.Context, roomID string) ([]Note, error) {
	roomRef := s.fs.Collection(roomsCollection).Doc(roomID)
	if _, err := roomRef.Get(ctx); err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrRoomNotFound
		}
		return nil, err
	}

	// A single-field orderBy on a subcollection needs no composite index.
	iter := roomRef.Collection(notesCollection).
		OrderBy("createdAt", firestore.Desc).
		Limit(maxNotesListed).
		Documents(ctx)
	defer iter.Stop()

	notes := make([]Note, 0)
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			return notes, nil
		}
		if err != nil {
			return nil, err
		}
		var note Note
		if err := doc.DataTo(&note); err != nil {
			log.Printf("decode note %s/%s: %v", roomID, doc.Ref.ID, err)
			continue
		}
		note.ID = doc.Ref.ID
		notes = append(notes, note)
	}
}
