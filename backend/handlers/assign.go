package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	ErrRoomNotFound        = errors.New("room not found")
	ErrRoomAlreadyAssigned = errors.New("room is already assigned")
	ErrRoomClosed          = errors.New("room is closed")
)

// roomAssigner atomically moves a room to "assigned".
type roomAssigner interface {
	Assign(ctx context.Context, id string, now time.Time) (Room, error)
}

// applyAssignment returns room transitioned to "assigned" at now. Rooms past
// the SLA are still assigned but flagged as breached.
func applyAssignment(room Room, now time.Time) (Room, error) {
	switch room.Status {
	case "assigned":
		return Room{}, ErrRoomAlreadyAssigned
	case "closed":
		return Room{}, ErrRoomClosed
	}
	room.SLABreached = IsSLAExpired(room.CreatedAt, now)
	room.Status = "assigned"
	room.AssignedAt = &now
	room.Expired = false
	return room, nil
}

// Assign handles POST /api/rooms/{id}/assign.
func (h *RoomHandler) Assign(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validRoomID(id) {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}

	room, err := h.assigner.Assign(r.Context(), id, h.now().UTC())
	switch {
	case errors.Is(err, ErrRoomNotFound):
		writeError(w, http.StatusNotFound, ErrRoomNotFound.Error())
	case errors.Is(err, ErrRoomAlreadyAssigned):
		writeError(w, http.StatusConflict, ErrRoomAlreadyAssigned.Error())
	case errors.Is(err, ErrRoomClosed):
		writeError(w, http.StatusConflict, ErrRoomClosed.Error())
	case err != nil:
		log.Printf("assign room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to assign room")
	default:
		WriteJSON(w, http.StatusOK, room)
	}
}

// validRoomID rejects IDs Firestore would treat as a path or reserve.
func validRoomID(id string) bool {
	if id == "" || len(id) > 128 || strings.Contains(id, "/") || id == "." || id == ".." {
		return false
	}
	return !(strings.HasPrefix(id, "__") && strings.HasSuffix(id, "__"))
}

type firestoreAssigner struct {
	fs *firestore.Client
}

func (a firestoreAssigner) Assign(ctx context.Context, id string, now time.Time) (Room, error) {
	ref := a.fs.Collection(roomsCollection).Doc(id)
	var assigned Room
	err := a.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return ErrRoomNotFound
		}
		if err != nil {
			return err
		}
		var room Room
		if err := snap.DataTo(&room); err != nil {
			return err
		}
		room.ID = ref.ID

		updated, err := applyAssignment(room, now)
		if err != nil {
			return err
		}
		if err := tx.Update(ref, []firestore.Update{
			{Path: "status", Value: updated.Status},
			{Path: "assignedAt", Value: now},
			{Path: "slaBreached", Value: updated.SLABreached},
		}); err != nil {
			return err
		}
		assigned = updated
		return nil
	})
	return assigned, err
}
