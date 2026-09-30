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

// SLAWaitLimit is how long a customer may wait before an agent claims the room.
const SLAWaitLimit = 5 * time.Minute

var (
	errRoomNotFound   = errors.New("room not found")
	errRoomClosed     = errors.New("closed rooms cannot be claimed")
	errAlreadyClaimed = errors.New("room is already claimed")
)

type claimRoomRequest struct {
	AgentName string `json:"agentName"`
}

// applyClaim assigns room to agent at now, recording whether the wait breached
// the SLA. It fails if the room is closed or already owned by an agent.
func applyClaim(room *Room, agent string, now time.Time) error {
	if room.Status == "closed" {
		return errRoomClosed
	}
	if room.AssignedAgent != "" || room.Status == "assigned" {
		return errAlreadyClaimed
	}
	wait := now.Sub(room.CreatedAt)
	if wait < 0 {
		wait = 0
	}
	room.Status = "assigned"
	room.AssignedAgent = agent
	room.ClaimedAt = &now
	room.WaitSeconds = int64(wait / time.Second)
	room.SLABreached = wait > SLAWaitLimit
	return nil
}

// Claim handles POST /api/rooms/{id}/claim with body {"agentName": string}.
// The read-check-write runs in a transaction so two agents cannot both claim
// the same room.
func (h *RoomHandler) Claim(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}
	var req claimRoomRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	agent := strings.TrimSpace(req.AgentName)
	if agent == "" || len(agent) > 100 {
		writeError(w, http.StatusBadRequest, "agentName is required (max 100 chars)")
		return
	}

	ref := h.fs.Collection(roomsCollection).Doc(id)
	var room Room
	err := h.fs.RunTransaction(r.Context(), func(_ context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return errRoomNotFound
		}
		if err != nil {
			return err
		}
		room = Room{}
		if err := doc.DataTo(&room); err != nil {
			return err
		}
		if err := applyClaim(&room, agent, time.Now().UTC()); err != nil {
			return err
		}
		return tx.Update(ref, []firestore.Update{
			{Path: "status", Value: room.Status},
			{Path: "assignedAgent", Value: room.AssignedAgent},
			{Path: "claimedAt", Value: *room.ClaimedAt},
			{Path: "waitSeconds", Value: room.WaitSeconds},
			{Path: "slaBreached", Value: room.SLABreached},
		})
	})
	switch {
	case errors.Is(err, errRoomNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, errRoomClosed), errors.Is(err, errAlreadyClaimed):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		log.Printf("claim room %s: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to claim room")
	default:
		room.ID = id
		WriteJSON(w, http.StatusOK, room)
	}
}
