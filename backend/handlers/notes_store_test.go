package handlers

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

// Integration tests for FirestoreNoteStore. They only run against the
// Firestore emulator:
//
//	firebase emulators:start --only firestore
//	FIRESTORE_EMULATOR_HOST=localhost:8080 go test ./handlers/ -run FirestoreNoteStore
func newEmulatorStore(t *testing.T) (*FirestoreNoteStore, *firestore.Client) {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST not set; skipping Firestore integration test")
	}
	fs, err := firestore.NewClient(context.Background(), "mini-kouventa-test")
	if err != nil {
		t.Fatalf("connect to emulator: %v", err)
	}
	t.Cleanup(func() { fs.Close() })
	return NewFirestoreNoteStore(fs), fs
}

func createTestRoom(t *testing.T, fs *firestore.Client) string {
	t.Helper()
	id := fmt.Sprintf("test-room-%d", time.Now().UnixNano())
	if _, err := fs.Collection(roomsCollection).Doc(id).Set(context.Background(), map[string]any{"name": "Test"}); err != nil {
		t.Fatalf("create room: %v", err)
	}
	return id
}

func TestFirestoreNoteStore_RoomExists(t *testing.T) {
	store, fs := newEmulatorStore(t)
	ctx := context.Background()
	roomID := createTestRoom(t, fs)

	tests := []struct {
		name   string
		roomID string
		want   bool
	}{
		{"existing room", roomID, true},
		{"missing room", "does-not-exist", false},
		{"id Firestore rejects", "__reserved__", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := store.RoomExists(ctx, tc.roomID)
			if err != nil {
				t.Fatalf("RoomExists: %v", err)
			}
			if got != tc.want {
				t.Errorf("RoomExists(%q) = %v, want %v", tc.roomID, got, tc.want)
			}
		})
	}
}

func TestFirestoreNoteStore_AddAndListNewestFirst(t *testing.T) {
	store, fs := newEmulatorStore(t)
	ctx := context.Background()
	roomID := createTestRoom(t, fs)
	t0 := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)

	older, err := store.AddNote(ctx, roomID, Note{Content: "older", CreatedAt: t0})
	if err != nil {
		t.Fatalf("AddNote: %v", err)
	}
	newer, err := store.AddNote(ctx, roomID, Note{Content: "newer", IsImportant: true, CreatedAt: t0.Add(time.Minute)})
	if err != nil {
		t.Fatalf("AddNote: %v", err)
	}
	if older.ID == "" || newer.ID == "" {
		t.Fatal("AddNote must return the generated document id")
	}

	got, err := store.ListNotes(ctx, roomID)
	if err != nil {
		t.Fatalf("ListNotes: %v", err)
	}
	if len(got) != 2 || got[0].ID != newer.ID || got[1].ID != older.ID {
		t.Fatalf("ListNotes = %+v, want [newer, older]", got)
	}
	if !got[0].IsImportant || got[0].Content != "newer" || !got[0].CreatedAt.Equal(t0.Add(time.Minute)) {
		t.Errorf("fields not round-tripped: %+v", got[0])
	}
}

func TestFirestoreNoteStore_ListEmptyRoom(t *testing.T) {
	store, fs := newEmulatorStore(t)

	got, err := store.ListNotes(context.Background(), createTestRoom(t, fs))
	if err != nil {
		t.Fatalf("ListNotes: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("ListNotes = %#v, want non-nil empty slice", got)
	}
}

func TestIsValidDocID(t *testing.T) {
	tests := []struct {
		id   string
		want bool
	}{
		{"abc123", true},
		{"Xy9_-.x", true},
		{"a.b", true},
		{"__not_reserved", true},
		{"", false},
		{".", false},
		{"..", false},
		{"a/b", false},
		{"x/notes/y", false},
		{"__reserved__", false},
		{"__x__", false},
		{strings.Repeat("a", 1500), true},
		{strings.Repeat("a", 1501), false},
	}
	for _, tc := range tests {
		name := tc.id
		if len(name) > 20 {
			name = fmt.Sprintf("%d bytes", len(tc.id))
		}
		t.Run(name, func(t *testing.T) {
			if got := isValidDocID(tc.id); got != tc.want {
				t.Errorf("isValidDocID(%q) = %v, want %v", name, got, tc.want)
			}
		})
	}
}
