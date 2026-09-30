package handlers

import (
	"context"
	"log"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

const notesCollection = "notes"

// FirestoreNoteStore stores notes in the rooms/{roomId}/notes subcollection.
type FirestoreNoteStore struct {
	fs *firestore.Client
}

func NewFirestoreNoteStore(fs *firestore.Client) *FirestoreNoteStore {
	return &FirestoreNoteStore{fs: fs}
}

func (s *FirestoreNoteStore) RoomExists(ctx context.Context, roomID string) (bool, error) {
	ref := s.fs.Collection(roomsCollection).Doc(roomID)
	if ref == nil {
		// Doc returns nil for IDs Firestore rejects (e.g. "__x__"); no such room can exist.
		return false, nil
	}
	snap, err := ref.Get(ctx)
	if snap != nil && !snap.Exists() {
		// Get reports a missing document as NotFound alongside a non-existent snapshot.
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *FirestoreNoteStore) AddNote(ctx context.Context, roomID string, note Note) (Note, error) {
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
	return notes, nil
}

func (s *FirestoreNoteStore) notes(roomID string) *firestore.CollectionRef {
	return s.fs.Collection(roomsCollection).Doc(roomID).Collection(notesCollection)
}
