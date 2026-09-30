# 01: An agent claims an unassigned room

**What to build:** "Agent Demo" (the hard-coded current agent) can click **Claim** on any unassigned room, meaning status `idle` or `bot`, in the chat list. On success the room becomes an assigned room owned by that agent, the chat list switches to the Assigned tab with the room selected, and the tile reads "Assigned to Agent Demo". Once a room is claimed, nobody can claim it again, including the same agent, and closed rooms can never be claimed. The system records who claimed the room and when. Two agents claiming at the same moment can't both win.

The API contract was agreed with the frontend team: `POST /api/rooms/{id}/claim` with body `{"agentName": string}`.
- **200:** returns the updated Room.
- **400:** malformed JSON, or an `agentName` that is blank after trimming or over 100 characters.
- **404:** unknown room.
- **409:** the room is already claimed ("room already claimed by <agent>") or closed ("closed rooms cannot be claimed").

Today each room tile is a single button, so a Claim button can't go inside it. The tile needs to be restructured as part of this ticket, so that selecting the row and claiming are separate actions.

Spec: `.scratch/agent-room-claim/spec.md`. Vocabulary: `CONTEXT.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A pure claim domain function takes the current room (or "not found"), the raw agent name and the current time. It returns the claimed room or a typed error: invalid agent name, not found, already claimed, or closed. It doesn't touch Firestore or HTTP.
- [ ] A successful claim sets `status = "assigned"`, `assignedAgent` (the trimmed name) and `claimedAt` (the time passed in, UTC).
- [ ] `POST /api/rooms/{id}/claim` runs the read, the domain function and the write inside a Firestore transaction using the server's clock, and maps errors to 400/404/409/500 as described above.
- [ ] Room JSON includes `assignedAgent` and `claimedAt` when set and leaves them out otherwise. Rooms created before this feature still load.
- [ ] The frontend API client exposes `claimRoom(roomId, agentName)`. The current agent name is a single constant, "Agent Demo".
- [ ] Idle and Bot tiles show a design-system Claim button (`bg-primary`, white text, about 4px radius). Assigned and Closed tiles don't.
- [ ] Clicking Claim doesn't select the row. The button is disabled while its request is pending.
- [ ] After a successful claim, the Assigned tab is active, the claimed room is selected, and its tile's preview line reads "Assigned to {assignedAgent}" in muted text.
- [ ] A failed claim shows the backend's error message inline on the tile and reloads the current tab.
- [ ] Clicking a tile (outside Claim) still selects the room as it does today.
- [ ] Go table tests for the domain function cover: `idle` and `bot` succeed, `assigned` fails (including a claim by the same agent), `closed` fails, not found, blank/whitespace/over-100 names are rejected, and the name is trimmed.
- [ ] ChatList tests (stubbed `fetch`) cover: which tiles show Claim, the request method/URL/body, switching to the Assigned tab with "Assigned to Agent Demo", a 409 error message shown, and Claim not selecting the row.
- [ ] `go test ./...`, `npm test` and `npm run typecheck` pass.
