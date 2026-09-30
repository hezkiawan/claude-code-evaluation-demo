package handlers

import (
	"errors"
	"fmt"
	"time"
)

var (
	ErrInvalidAgentName = errors.New("agentName is required (max 100 chars)")
	ErrRoomNotFound     = errors.New("room not found")
	ErrAlreadyClaimed   = errors.New("room already claimed")
	ErrRoomClosed       = errors.New("closed rooms cannot be claimed")
)

// ClaimRoom decides whether agentName may claim room at time now and returns
// the claimed room. A nil room means the room does not exist. The input room is
// not modified. Errors wrap one of the Err* sentinels above.
func ClaimRoom(room *Room, agentName string, now time.Time) (Room, error) {
	agentName, ok := validName(agentName)
	if !ok {
		return Room{}, ErrInvalidAgentName
	}
	if room == nil {
		return Room{}, ErrRoomNotFound
	}

	switch room.Status {
	case "idle", "bot":
	case "closed":
		return Room{}, ErrRoomClosed
	default:
		if room.AssignedAgent == "" {
			return Room{}, ErrAlreadyClaimed
		}
		return Room{}, fmt.Errorf("%w by %s", ErrAlreadyClaimed, room.AssignedAgent)
	}

	claimedAt := now.UTC()
	claimed := *room
	claimed.Status = "assigned"
	claimed.AssignedAgent = agentName
	claimed.ClaimedAt = &claimedAt
	return claimed, nil
}
