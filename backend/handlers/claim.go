package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// slaThreshold is how long a customer may wait before a claim breaches the SLA.
// Keep in sync with SLA_THRESHOLD_MS in frontend/lib/sla.ts.
const slaThreshold = 5 * time.Minute

const maxAgentNameLen = 100

var (
	errRoomNotFound       = errors.New("room not found")
	errRoomAlreadyClaimed = errors.New("room is already claimed")
	errRoomClosed         = errors.New("room is closed")
)

var claimableStatuses = map[string]bool{"idle": true, "bot": true}

type claimRoomRequest struct {
	AgentName string `json:"agentName"`
}

// applyClaim returns a copy of room assigned to agentName at now. Waiting
// strictly longer than slaThreshold marks the claim as an SLA breach.
func applyClaim(room Room, agentName string, now time.Time) (Room, error) {
	switch {
	case room.Status == "closed":
		return Room{}, errRoomClosed
	case !claimableStatuses[room.Status]:
		return Room{}, errRoomAlreadyClaimed
	}

	claimedAt := now.UTC()
	claimed := room
	claimed.Status = "assigned"
	claimed.AssignedAgent = agentName
	claimed.ClaimedAt = &claimedAt
	claimed.SLABreached = claimedAt.Sub(room.CreatedAt) > slaThreshold
	return claimed, nil
}

// Claim handles POST /api/rooms/{id}/claim.
func (h *RoomHandler) Claim(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validRoomID(id) {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}

	var req claimRoomRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	agentName := strings.TrimSpace(req.AgentName)
	if agentName == "" || len(agentName) > maxAgentNameLen {
		writeError(w, http.StatusBadRequest, "agentName is required (max 100 chars)")
		return
	}

	room, err := h.claimRoom(r.Context(), id, agentName)
	switch {
	case err == nil:
		WriteJSON(w, http.StatusOK, room)
	case errors.Is(err, errRoomNotFound):
		writeError(w, http.StatusNotFound, "room not found")
	case errors.Is(err, errRoomAlreadyClaimed):
		writeError(w, http.StatusConflict, "room is already claimed by another agent")
	case errors.Is(err, errRoomClosed):
		writeError(w, http.StatusConflict, "closed rooms cannot be claimed")
	default:
		log.Printf("claim room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to claim room")
	}
}

// claimInFirestore claims the room inside a transaction so two agents racing
// for the same room cannot both succeed.
func (h *RoomHandler) claimInFirestore(ctx context.Context, id, agentName string) (Room, error) {
	ref := h.fs.Collection(roomsCollection).Doc(id)
	var claimed Room
	err := h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return errRoomNotFound
		}
		if err != nil {
			return err
		}
		var room Room
		if err := snap.DataTo(&room); err != nil {
			return err
		}
		room.ID = ref.ID

		next, err := applyClaim(room, agentName, time.Now())
		if err != nil {
			return err
		}
		claimed = next
		return tx.Update(ref, []firestore.Update{
			{Path: "status", Value: next.Status},
			{Path: "assignedAgent", Value: next.AssignedAgent},
			{Path: "claimedAt", Value: *next.ClaimedAt},
			{Path: "slaBreached", Value: next.SLABreached},
		})
	})
	return claimed, err
}

// validRoomID rejects ids Firestore would treat as a path rather than a document id.
func validRoomID(id string) bool {
	return id != "" && id != "." && id != ".." && len(id) <= 1500 && !strings.Contains(id, "/")
}
