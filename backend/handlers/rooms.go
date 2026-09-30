package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
)

const roomsCollection = "rooms"

var (
	validPlatforms = map[string]bool{"whatsapp": true, "livechat": true}
	validStatuses  = map[string]bool{"assigned": true, "idle": true, "bot": true, "closed": true}
)

// Room is the API representation of a document in the `rooms` collection.
type Room struct {
	ID        string    `json:"id" firestore:"-"`
	Name      string    `json:"name" firestore:"name"`
	Platform  string    `json:"platform" firestore:"platform"`
	Status    string    `json:"status" firestore:"status"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`

	// Claim fields; absent until an agent claims the room.
	AssignedAgent string     `json:"assignedAgent,omitempty" firestore:"assignedAgent,omitempty"`
	ClaimedAt     *time.Time `json:"claimedAt,omitempty" firestore:"claimedAt,omitempty"`
	// Recorded at claim time and final. Pointers so a recorded 0 / false is
	// still emitted.
	WaitSeconds *int64 `json:"waitSeconds,omitempty" firestore:"waitSeconds,omitempty"`
	SLABreached *bool  `json:"slaBreached,omitempty" firestore:"slaBreached,omitempty"`
}

type createRoomRequest struct {
	CustomerName string `json:"customerName"`
	Platform     string `json:"platform"`
}

type RoomHandler struct {
	fs *firestore.Client
}

func NewRoomHandler(fs *firestore.Client) *RoomHandler {
	return &RoomHandler{fs: fs}
}

// Create handles POST /api/rooms.
func (h *RoomHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	var ok bool
	if req.CustomerName, ok = validName(req.CustomerName); !ok {
		writeError(w, http.StatusBadRequest, "customerName is required (max 100 chars)")
		return
	}
	if !validPlatforms[req.Platform] {
		writeError(w, http.StatusBadRequest, `platform must be "whatsapp" or "livechat"`)
		return
	}

	room := Room{
		Name:      req.CustomerName,
		Platform:  req.Platform,
		Status:    "idle",
		CreatedAt: time.Now().UTC(),
	}
	ref, _, err := h.fs.Collection(roomsCollection).Add(r.Context(), room)
	if err != nil {
		log.Printf("create room: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create room")
		return
	}
	room.ID = ref.ID
	WriteJSON(w, http.StatusCreated, room)
}

type claimRoomRequest struct {
	AgentName string `json:"agentName"`
}

// Claim handles POST /api/rooms/{id}/claim. The read, the ClaimRoom decision
// and the write run in one transaction so concurrent claims can't both win.
func (h *RoomHandler) Claim(w http.ResponseWriter, r *http.Request) {
	var req claimRoomRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ref := h.fs.Collection(roomsCollection).Doc(r.PathValue("id"))
	var claimed Room
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		var current *Room
		snap, err := tx.Get(ref)
		switch {
		case grpcstatus.Code(err) == codes.NotFound:
		case err != nil:
			return err
		default:
			current = &Room{}
			if err := snap.DataTo(current); err != nil {
				return err
			}
			current.ID = ref.ID
		}

		claimed, err = ClaimRoom(current, req.AgentName, time.Now())
		if err != nil {
			return err
		}
		return tx.Update(ref, []firestore.Update{
			{Path: "status", Value: claimed.Status},
			{Path: "assignedAgent", Value: claimed.AssignedAgent},
			{Path: "claimedAt", Value: *claimed.ClaimedAt},
			{Path: "waitSeconds", Value: *claimed.WaitSeconds},
			{Path: "slaBreached", Value: *claimed.SLABreached},
		})
	})

	switch {
	case err == nil:
		WriteJSON(w, http.StatusOK, claimed)
	case errors.Is(err, ErrInvalidAgentName):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrRoomNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrAlreadyClaimed), errors.Is(err, ErrRoomClosed):
		writeError(w, http.StatusConflict, err.Error())
	default:
		log.Printf("claim room %s: %v", ref.ID, err)
		writeError(w, http.StatusInternalServerError, "failed to claim room")
	}
}

// List handles GET /api/rooms. Without a query it returns every non-closed
// room; `?status=<assigned|idle|bot|closed>` narrows to one status.
func (h *RoomHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status != "" && !validStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status filter")
		return
	}

	q := h.fs.Collection(roomsCollection).Query
	if status != "" {
		q = q.Where("status", "==", status)
	}

	rooms := make([]Room, 0)
	iter := q.Documents(r.Context())
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("list rooms: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to fetch rooms")
			return
		}
		var room Room
		if err := doc.DataTo(&room); err != nil {
			log.Printf("decode room %s: %v", doc.Ref.ID, err)
			continue
		}
		if status == "" && room.Status == "closed" {
			continue
		}
		room.ID = doc.Ref.ID
		rooms = append(rooms, room)
	}

	// Sorted in memory so no composite index is needed.
	sort.Slice(rooms, func(i, j int) bool { return rooms[i].CreatedAt.After(rooms[j].CreatedAt) })
	WriteJSON(w, http.StatusOK, rooms)
}

const maxNameLen = 100

// validName trims s and reports whether it is non-empty and at most
// maxNameLen bytes. Shared by customer and agent names.
func validName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	return s, s != "" && len(s) <= maxNameLen
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write json: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}
