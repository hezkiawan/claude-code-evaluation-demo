package handlers

import (
	"context"
	"log"
	"strings"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const notesCollection = "notes"

// FirestoreNoteStore keeps Internal Notes in the `rooms/{roomId}/notes` subcollection.
type FirestoreNoteStore struct {
	fs *firestore.Client
}

func NewFirestoreNoteStore(fs *firestore.Client) *FirestoreNoteStore {
	return &FirestoreNoteStore{fs: fs}
}

func (s *FirestoreNoteStore) RoomExists(ctx context.Context, roomID string) (bool, error) {
	// A slash would address a nested path rather than a Room document.
	if roomID == "" || strings.Contains(roomID, "/") {
		return false, nil
	}
	_, err := s.fs.Collection(roomsCollection).Doc(roomID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *FirestoreNoteStore) CreateNote(ctx context.Context, roomID string, note Note) (Note, error) {
	ref, _, err := s.notes(roomID).Add(ctx, note)
	if err != nil {
		return Note{}, err
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
			return nil, err
		}
		var note Note
		if err := doc.DataTo(&note); err != nil {
			log.Printf("decode note %s in room %s: %v", doc.Ref.ID, roomID, err)
			continue
		}
		note.ID = doc.Ref.ID
		notes = append(notes, note)
	}
	// Re-sorted in memory so the ID tie-break is explicit, not an index detail.
	sortNotesNewestFirst(notes)
	return notes, nil
}

func (s *FirestoreNoteStore) notes(roomID string) *firestore.CollectionRef {
	return s.fs.Collection(roomsCollection).Doc(roomID).Collection(notesCollection)
}
