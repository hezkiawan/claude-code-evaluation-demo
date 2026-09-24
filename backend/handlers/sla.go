package handlers

import "time"

// AssignSLA is how long a room may wait before an agent picks it up.
const AssignSLA = 5 * time.Minute

// IsSLAExpired reports whether a room created at createdAt has waited longer
// than AssignSLA as of now.
func IsSLAExpired(createdAt, now time.Time) bool {
	return now.Sub(createdAt) > AssignSLA
}

// withSLAStatus sets Expired for rooms still waiting on an agent.
func withSLAStatus(room Room, now time.Time) Room {
	waiting := room.Status == "idle" || room.Status == "bot"
	room.Expired = waiting && IsSLAExpired(room.CreatedAt, now)
	return room
}
