package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
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
	req.CustomerName = strings.TrimSpace(req.CustomerName)
	if req.CustomerName == "" || len(req.CustomerName) > 100 {
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
