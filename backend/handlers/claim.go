package handlers

import (
	"errors"
	"fmt"
	"time"
)

// SLAThreshold is the longest a room may wait for a claim. A wait strictly
// greater than this is an SLA breach.
const SLAThreshold = 5 * time.Minute

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
	// The breach is decided on the recorded whole seconds so the two stored
	// values never disagree (5:00.4 records 300s, not breached).
	waitSeconds := int64(max(claimedAt.Sub(room.CreatedAt), 0) / time.Second)
	breached := waitSeconds > int64(SLAThreshold/time.Second)

	claimed := *room
	claimed.Status = "assigned"
	claimed.AssignedAgent = agentName
	claimed.ClaimedAt = &claimedAt
	claimed.WaitSeconds = &waitSeconds
	claimed.SLABreached = &breached
	return claimed, nil
}
