# TDD Evidence: Room Assignment with 5-Minute SLA (backend)

**Source plan:** inline `/ecc:plan` output (2026-09-24), Phases 1–2 (backend only).
**Decision from review:** expired rooms may still be assigned; they are stored with `slaBreached: true` (plan's open question 1).

## User journeys
1. As an agent, I want to assign a waiting chat to myself so it moves to my Assigned queue.
2. As a supervisor, I want chats assigned after waiting > 5 minutes recorded as SLA-breached, so breaches are auditable without blocking the agent.
3. As an agent, I want a clear error when a chat is already assigned, closed, or missing, instead of silently taking it over.

## Checkpoints (branch `eval/everything-claude-code`)
| Stage | Commit | Evidence |
|---|---|---|
| RED | `05fb5f7` test: add failing tests… | `go test ./handlers/` → build failed: `undefined: AssignSLA`, `IsSLAExpired`, `applyAssignment`, `RoomHandler.Assign`, … (compile-time RED, missing implementation only) |
| GREEN | `ba0fe52` feat: add POST /api/rooms/{id}/assign… | `go test -v ./handlers/` → `ok mini-kouventa/backend/handlers`, 6 tests / 21 subtests PASS; `go vet ./...` and `go build ./...` clean |
| Refactor | skipped | No duplication worth extracting |

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | SLA is exactly 5 minutes | `sla_test.go:TestAssignSLAIsFiveMinutes` | unit | PASS |
| 2 | Waiting ≤ 5m is not expired; > 5m is; future `createdAt` (clock skew) is not | `sla_test.go:TestIsSLAExpired` | unit | PASS |
| 3 | `expired` is true only for idle/bot rooms past SLA; never for assigned/closed | `sla_test.go:TestWithSLAStatus` | unit | PASS |
| 4 | idle/bot rooms become `assigned` with `assignedAt = now` | `assign_test.go:TestApplyAssignment` | unit | PASS |
| 5 | Rooms past SLA are still assigned, with `slaBreached = true`; exactly 5m is not breached | `assign_test.go:TestApplyAssignment` | unit | PASS |
| 6 | Already-assigned → `ErrRoomAlreadyAssigned`; closed → `ErrRoomClosed`; input is not mutated | `assign_test.go:TestApplyAssignment` | unit | PASS |
| 7 | `POST /api/rooms/{id}/assign` returns 200 with `status`, `assignedAt`, `slaBreached`; passes path id and injected clock to the store | `assign_test.go:TestAssignHandlerSuccess` | handler (httptest + real ServeMux) | PASS |
| 8 | 404 for missing room; 409 for assigned/closed (including wrapped errors); 500 with a generic message that hides storage details | `assign_test.go:TestAssignHandlerErrors` | handler | PASS |
| 9 | 400 for ids with encoded `/`, reserved `__x__`, or > 128 chars; store is not called | `assign_test.go:TestAssignHandlerRejectsInvalidIDs` | handler | PASS |

## Coverage and known gaps
`go test -coverprofile ./handlers/` → **30.4% of package statements** (below the 80% target).

| Function | Coverage |
|---|---|
| `applyAssignment`, `RoomHandler.Assign`, `validRoomID`, `IsSLAExpired`, `withSLAStatus` | 100% |
| `firestoreAssigner.Assign` (transaction) | 0% |
| `Create`, `List`, `NewRoomHandler` (pre-existing) | 0% |

**Gap:** `firestoreAssigner.Assign` (the read-check-update inside `RunTransaction`, including NotFound → 404 mapping and the concurrent-assign race) and the pre-existing `Create`/`List` need a Firestore instance. No emulator is installed on this machine (`firebase` / `gcloud` CLIs absent, `FIRESTORE_EMULATOR_HOST` unset). The follow-up is an emulator-backed integration test gated on `FIRESTORE_EMULATOR_HOST` that covers: assign fresh room, assign stale room (`slaBreached` persisted), double-assign → 409, and missing id → 404.

Manual smoke test, once the server is running:
```bash
curl -X POST localhost:8080/api/rooms/<id>/assign
```
