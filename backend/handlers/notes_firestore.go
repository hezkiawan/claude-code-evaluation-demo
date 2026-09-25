package handlers

import (
	"context"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

// notesCollection is the subcollection under each room document that holds
// its notes: rooms/{roomId}/notes/{noteId}.
const notesCollection = "notes"

// FirestoreNoteStore stores notes in a subcollection of the room document.
type FirestoreNoteStore struct {
	fs *firestore.Client
}

func NewFirestoreNoteStore(fs *firestore.Client) *FirestoreNoteStore {
	return &FirestoreNoteStore{fs: fs}
}

func (s *FirestoreNoteStore) notes(roomID string) *firestore.CollectionRef {
	return s.fs.Collection(roomsCollection).Doc(roomID).Collection(notesCollection)
}

func (s *FirestoreNoteStore) CreateNote(ctx context.Context, roomID, content string, isImportant bool) (Note, error) {
	n := Note{
		RoomID:      roomID,
		Content:     content,
		IsImportant: isImportant,
		CreatedAt:   time.Now().UTC(),
	}
	ref, _, err := s.notes(roomID).Add(ctx, n)
	if err != nil {
		return Note{}, err
	}
	n.ID = ref.ID
	return n, nil
}

func (s *FirestoreNoteStore) ListNotes(ctx context.Context, roomID string) ([]Note, error) {
	iter := s.notes(roomID).OrderBy("createdAt", firestore.Desc).Documents(ctx)
	defer iter.Stop()

	notes := []Note{} // encode as [] rather than null
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			return notes, nil
		}
		if err != nil {
			return nil, err
		}
		var n Note
		if err := doc.DataTo(&n); err != nil {
			return nil, err
		}
		n.ID = doc.Ref.ID
		n.RoomID = roomID
		notes = append(notes, n)
	}
}
