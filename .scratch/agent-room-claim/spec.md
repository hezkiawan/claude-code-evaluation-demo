# Spec: Agents can claim rooms from the queue

Status: ready-for-agent

Kouventa feature: "Agent Queue Management & Room Assignment". Vocabulary follows `CONTEXT.md` (Room, Agent, Unassigned room, Claim, Assigned room, Wait time, SLA threshold, SLA breach).

## Problem Statement

Support agents can see unassigned rooms in the chat list, but no agent can take ownership of a room. The Assigned tab is therefore always empty, and nobody knows who is responsible for which customer. Agents and supervisors also can't see which customers have waited too long for an agent, so the 5-minute service commitment is invisible and can't be audited.

## Solution

An agent can **claim** an unassigned room (status `idle` or `bot`) straight from the chat list. Once claimed, the room belongs to that agent: it becomes an assigned room, moves to the Assigned tab showing the agent's name, and can't be claimed again by anyone, including the same agent. Closed rooms can never be claimed.

The system records who claimed each room and when. It also records whether the customer's wait time went past the 5-minute SLA threshold (an **SLA breach**). The backend decides and stores the breach at claim time. Before a claim, unassigned rooms that have waited more than 5 minutes show a red "SLA breached" badge. The badge appears live, with no page refresh.

There is no login yet, so the current agent is always "Agent Demo".

## User Stories

1. As an agent, I want a "Claim" button on every unassigned room in the chat list, so that I can take ownership of a customer conversation.
2. As an agent, I want the Claim button on both Idle and Bot rooms, so that I can take over rooms the bot is handling as well as rooms nobody is handling.
3. As an agent, I want no Claim button on assigned or closed rooms, so that I'm not offered actions that can't succeed.
4. As an agent, I want clicking Claim not to open the room as if I had clicked the row, so that the two actions don't interfere.
5. As an agent, I want the Claim button disabled while my claim is being processed, so that I can't send duplicate claims by double-clicking.
6. As an agent, I want to land on the Assigned tab with the claimed room selected after a successful claim, so that I can start working on it right away.
7. As an agent, I want the claimed room to disappear from the Idle/Bot list, so that the queue shows only rooms that still need an owner.
8. As an agent, I want each assigned room in the Assigned tab to show "Assigned to {agent name}", so that I can see who owns it.
9. As an agent, I want a clear error message when my claim fails, for example because another agent claimed the room first, so that I understand why it didn't work.
10. As an agent, I want the list to reload after a failed claim, so that I see the room's current state instead of stale data.
11. As an agent, I want a red "SLA breached" badge on unassigned rooms whose wait time is over 5 minutes, so that I can prioritise the customers who have waited longest.
12. As an agent, I want that badge to appear on its own the moment a room passes 5 minutes, without refreshing, so that I notice breaches as they happen.
13. As an agent, I want no badge on rooms that have waited exactly 5 minutes or less, so that the badge means a real breach.
14. As an agent, I want no SLA badge on assigned or closed rooms, so that the badge only marks customers who are still waiting.
15. As an agent, I want to still be able to claim a room after its SLA is breached, so that late customers still get served.
16. As a supervisor, I want every claimed room to record which agent claimed it, so that ownership is accountable.
17. As a supervisor, I want every claimed room to record when it was claimed, so that response times can be reviewed.
18. As a supervisor, I want every claimed room to record whether the SLA was breached, so that SLA compliance can be audited.
19. As a supervisor, I want the recorded wait time (in seconds) stored with the claim, so that a breach can be checked later without recomputing it.
20. As a supervisor, I want the backend to decide the recorded breach using its own clock, so that a wrong or tampered browser clock can't change the audit record.
21. As a supervisor, I want the breach record to be final once written, so that the history can't drift.
22. As an agent, I want a room to be claimable by only one agent, even if two agents click Claim at the same moment, so that ownership is never ambiguous.
23. As an agent, I want claiming an already-assigned room to fail even if I am the one who owns it, so that duplicate claims are surfaced instead of silently accepted.
24. As an agent, I want claiming a closed room to fail with a clear reason, so that I know the conversation is over.
25. As a frontend developer, I want `POST /api/rooms/{id}/claim` with body `{"agentName": string}`, as agreed with the frontend team, so that the client integrates against a stable contract.
26. As a frontend developer, I want a blank, missing or over-100-character `agentName` rejected with a 400, so that invalid owners are never stored.
27. As a frontend developer, I want a 404 for an unknown room ID and a 409 for an unclaimable room, each with an explanatory `error` message, so that the UI can tell the failures apart and show them.
28. As a frontend developer, I want a successful claim to return the updated room, so that the UI can update without another fetch.
29. As a frontend developer, I want the room list endpoint to include the claim fields when they exist, so that the Assigned tab can show the agent name.
30. As a developer, I want rooms created before this feature (with no claim fields) to keep loading correctly, so that existing data isn't broken.
31. As a user of the design system, I want the Claim button, SLA badge and assigned-to line to use the existing tokens and pill shapes, so that the feature looks native to Kouventa.

## Implementation Decisions

### Domain rules
- **Unassigned room** = status `idle` or `bot`. Only unassigned rooms can be claimed.
- **Wait time** = claim time (or "now" for display) − room `createdAt`.
- **SLA threshold** = 5 minutes. **SLA breach** = wait time strictly greater than 5:00. A wait of exactly 5:00 is not a breach.
- A room that is already `assigned` can't be claimed. This includes a repeat claim by the same agent. A `closed` room can never be claimed.
- The agent name is trimmed. After trimming it must be non-empty and at most 100 characters. This matches the existing `customerName` rule.

### Backend: claim domain function (new, deep module)
- A pure function in the handlers package. It takes the current room state (or "not found"), the raw agent name and the current time. It returns either the updated room or a typed error: invalid agent name, room not found, already claimed, or room closed.
- It owns validation, eligibility, the breach calculation and building the new state. It never touches Firestore or HTTP.
- On success the room gets `status = "assigned"`, `assignedAgent` (the trimmed name), `claimedAt` (the passed-in time, UTC), `waitSeconds` (a whole number of seconds from `createdAt` to `claimedAt`) and `slaBreached` (wait > 5 minutes).

### Backend: claim HTTP handler
- New route `POST /api/rooms/{id}/claim`, registered alongside the existing room routes using Go 1.22 method+path patterns and `r.PathValue("id")`.
- Decodes `{"agentName": string}` using the same body-size limit and invalid-JSON handling as room creation.
- Runs a Firestore transaction: read the room document, call the claim domain function with the server's current time, then write the updated fields. This way two simultaneous claims can't both succeed.
- Error mapping:
  - Malformed JSON or an invalid agent name → **400**
  - Room not found → **404**
  - Already claimed → **409** `"room already claimed by <agent>"`
  - Closed → **409** `"closed rooms cannot be claimed"`
  - Unexpected Firestore failure → **500** (logged)
- Success → **200** with the updated Room JSON.
- CORS already allows POST, so no change is needed.

### Schema / Room representation
- The Room model gains four optional fields: `assignedAgent` (string), `claimedAt` (timestamp), `waitSeconds` (integer) and `slaBreached` (boolean).
- They are left out of the JSON when unset. Rooms without them (created before this feature, or not yet claimed) decode unchanged.
- No migration is needed.

### Frontend
- **API client:** new `claimRoom(roomId, agentName)` that calls the endpoint and returns the updated Room. It reuses the existing request helper, which already turns error bodies into thrown `Error` messages.
- **Types:** the Room type gains the four optional claim fields.
- **Current agent:** a single constant `"Agent Demo"`, defined in one place so real auth can replace it later.
- **SLA helper:** one shared function that decides whether a room's wait at a given "now" is a breach. It uses the same strictly-greater-than-5:00 rule as the backend.
- **Chat list:**
  - The existing 60-second "now" tick becomes a 1-second tick, so the SLA badge appears within a second of the breach and relative timestamps stay fresh.
  - Unassigned tiles show a "Claim" button and, when breached, an "SLA breached" pill.
  - The Claim button stops click propagation so it doesn't select the row, and it's disabled while its claim is in flight.
  - On success, the list switches to the Assigned tab and selects the returned room.
  - On failure, the error message shows inline on that tile and the current tab reloads.
- **Assigned tiles:** the preview line reads "Assigned to {assignedAgent}" instead of "Customer conversation".
- **Nesting:** the tile is currently a single `<button>`. Putting a Claim button inside it would nest interactive elements, so the tile's structure must change to allow a separate Claim button, for example a row container with a select action and a sibling Claim button.
- **Design system:**
  - Claim button: `bg-primary`, white text, about 4px radius, compact.
  - "SLA breached" pill: `bg-danger` with white text, same pill shape as `StatusBadge`.
  - Muted text for the assigned-to line.
  - No new colours. Components reference token-backed Tailwind classes, not raw hex.
  - Don't call the breach "Expired": that word means the WhatsApp session window.

## Testing Decisions

- **What makes a good test:** it goes through a public interface and checks externally observable behaviour: returned values and errors on the backend, and what the user sees and can click on the frontend. It doesn't assert internal state, private helpers or call counts on internals. It controls time explicitly (a passed-in `now` in Go, fake timers in vitest) instead of sleeping.
- **Backend seam: the claim domain function.**
  - Go table tests cover:
    - claiming `idle` and `bot` rooms succeeds with every field set correctly
    - `assigned` fails (including when the owner is the same agent)
    - `closed` fails
    - not found
    - blank, whitespace-only and over-100-character agent names are rejected, and the name is trimmed
    - the SLA boundary: a wait of 4:59 or exactly 5:00 is not breached, and 5:01 is breached
    - `waitSeconds` is computed correctly
  - There are no Go tests in the repo yet. Use the standard `testing` package with table-driven style.
  - The Firestore transaction and HTTP status mapping are kept thin and are not covered by automated tests. Verify them manually against a running backend.
- **Frontend seam: the ChatList component.**
  - Render it with global `fetch` stubbed and vitest fake timers. Cover:
    - unassigned tiles show Claim, and assigned or closed tiles don't
    - the SLA badge is absent at ≤ 5:00 and appears on its own after time advances past 5:00, with no refetch
    - clicking Claim sends `POST /api/rooms/{id}/claim` with `{"agentName":"Agent Demo"}`
    - after success, the Assigned tab is active and shows "Assigned to Agent Demo"
    - a 409 response shows its error message
    - clicking Claim doesn't select the row
  - Prior art: `frontend/__tests__/smoke.test.tsx`, which uses vitest, Testing Library and jest-dom in jsdom. `@testing-library/user-event` is already installed.
- **Must pass:** `go test ./...`, `npm test` and `npm run typecheck`.

## Out of Scope

- Authentication or real agent identity. "Agent Demo" is hard-coded.
- Unclaiming, reassigning, transferring or closing rooms.
- Live list updates (new rooms appearing, or claims by other agents showing up without a refresh). Only the SLA badge is live.
- Showing an SLA-breach marker on assigned rooms, and any SLA reporting or dashboard. The breach is recorded but not displayed after the claim.
- A separate "entered queue" timestamp and bot→idle handoff semantics. Wait time always runs from `createdAt`.
- A configurable SLA threshold. It is fixed at 5 minutes.
- Firestore emulator setup and backend HTTP integration tests.

## Further Notes

- The component called "sidebar" in the original request is `ChatList`, the room list. The component named `Sidebar` is the icon navigation and isn't changed.
- The frontend badge is only a display hint that uses the browser clock. The stored breach always comes from the backend clock, so a room may briefly show the badge a second earlier or later than the recorded value. That's acceptable.
- The glossary terms for this feature were added to `CONTEXT.md` during the grilling session.
