package handlers

import (
	"context"
	"fmt"
	"log"
	"strings"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

const (
	notesCollection = "notes"
	maxDocIDBytes   = 1500
)

// FirestoreNoteStore stores notes in the rooms/{roomId}/notes subcollection.
type FirestoreNoteStore struct {
	fs *firestore.Client
}

func NewFirestoreNoteStore(fs *firestore.Client) *FirestoreNoteStore {
	return &FirestoreNoteStore{fs: fs}
}

func (s *FirestoreNoteStore) RoomExists(ctx context.Context, roomID string) (bool, error) {
	if !isValidDocID(roomID) {
		// Also stops a "/" (from an escaped %2F in the URL) from addressing
		// another document path, e.g. rooms/x/notes/y.
		return false, nil
	}
	snap, err := s.fs.Collection(roomsCollection).Doc(roomID).Get(ctx)
	if snap != nil && !snap.Exists() {
		// Get reports a missing document as NotFound alongside a non-existent snapshot.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get room %s: %w", roomID, err)
	}
	return true, nil
}

func (s *FirestoreNoteStore) AddNote(ctx context.Context, roomID string, note Note) (Note, error) {
	ref, _, err := s.notes(roomID).Add(ctx, note)
	if err != nil {
		return Note{}, fmt.Errorf("add note to room %s: %w", roomID, err)
	}
	note.ID = ref.ID
	return note, nil
}

func (s *FirestoreNoteStore) ListNotes(ctx context.Context, roomID string) ([]Note, error) {
	notes := make([]Note, 0)
	iter := s.notes(roomID).OrderBy("createdAt", firestore.Desc).Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("list notes in room %s: %w", roomID, err)
		}
		var note Note
		if err := doc.DataTo(&note); err != nil {
			log.Printf("decode note %s in room %s: %v", doc.Ref.ID, roomID, err)
			continue
		}
		note.ID = doc.Ref.ID
		notes = append(notes, note)
	}
	return notes, nil
}

func (s *FirestoreNoteStore) notes(roomID string) *firestore.CollectionRef {
	return s.fs.Collection(roomsCollection).Doc(roomID).Collection(notesCollection)
}

// isValidDocID reports whether id is a legal single Firestore document ID
// (https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields).
func isValidDocID(id string) bool {
	if id == "" || id == "." || id == ".." || len(id) > maxDocIDBytes || strings.Contains(id, "/") {
		return false
	}
	isReserved := len(id) >= 4 && strings.HasPrefix(id, "__") && strings.HasSuffix(id, "__")
	return !isReserved
}
