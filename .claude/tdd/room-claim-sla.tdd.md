# TDD Evidence: Agent room claiming + SLA breach

**Source plan**: inline `/ecc:plan` output (approved in-session, 2026-09-30). No `*.plan.md` file.
**Branch**: `run/F2-C2`

## User journeys
1. As a support agent, I want to claim an unassigned (idle/bot) room, so that it becomes mine and nobody else can take it.
2. As a team lead, I want to know who claimed a room and when, and whether the customer waited more than 5 minutes (SLA breach).
3. As a support agent, I want to see a red "SLA breached" badge appear live on rooms that have waited over 5 minutes, so that I can prioritise them.
4. As a support agent, I want claimed rooms to show in the Assigned tab with the agent's name.

## Checkpoints
| Stage | Commit | Evidence |
|---|---|---|
| Backend RED | `cb61c74` | `go test ./...` → build failed: `undefined: applyClaim`, `errRoomAlreadyClaimed`, `errRoomClosed`, `h.Claim`, `Room.AssignedAgent/ClaimedAt/SLABreached` |
| Backend GREEN | `bef6eda` | `go vet ./...` clean; `go test ./...` → `ok mini-kouventa/backend/handlers` |
| Frontend RED | `bb9a64b` | `vitest run` → 4 files failed, 9 tests failed (missing `lib/sla`, `lib/useSlaBreached`, `claimRoom`; no Claim button / SLA badge / agent label). Closed-room guard passed (regression guard). |
| Frontend GREEN | `12614cd` | `vitest run` → 5 files, 22 tests passed; `tsc --noEmit` clean |
| Refactor | (this commit) | State hooks grouped in `ChatList`; flaky live-badge test stabilised (1/5 runs failed with `shouldAdvanceTime` + sync `getByText`; now `advanceTimersByTimeAsync` + `findByText`, 10/10 green). `next build` succeeds. |

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | idle and bot rooms become `assigned` with agent + `claimedAt` | `claim_test.go:TestApplyClaim` | unit | PASS |
| 2 | Waiting 4m59s / exactly 5m is not a breach; 5m01s is | `claim_test.go:TestApplyClaim` | unit | PASS |
| 3 | Assigned rooms → `errRoomAlreadyClaimed`; closed → `errRoomClosed` | `claim_test.go:TestApplyClaim` | unit | PASS |
| 4 | Input room is not mutated | `TestApplyClaimDoesNotMutateInput` | unit | PASS |
| 5 | 400 on invalid JSON, missing/blank/too-long agentName, id containing `/` (store not called) | `TestClaimHandler` | HTTP | PASS |
| 6 | 404 not found; 409 already claimed / closed; 500 without leaking internals | `TestClaimHandler` | HTTP | PASS |
| 7 | Agent name is trimmed; response carries status/assignedAgent/claimedAt/slaBreached | `TestClaimHandlerPassesTrimmedAgentAndReturnsRoom` | HTTP | PASS |
| 8 | Frontend SLA boundary matches backend (strictly > 5m); bad timestamps never breach | `__tests__/sla.test.ts` | unit | PASS |
| 9 | Badge flag flips live at the deadline; disabled/invalid stays false; timer cleaned up | `__tests__/useSlaBreached.test.tsx` | unit | PASS |
| 10 | `claimRoom` POSTs `{agentName}` to `/api/rooms/{encoded id}/claim`, surfaces API errors | `__tests__/api.test.ts` | unit | PASS |
| 11 | Claim button on unassigned rooms; claims as "Agent Demo"; room leaves queue; error shown as alert | `__tests__/ChatList.test.tsx` | component | PASS |
| 12 | SLA badge appears live without refetch; immediately for overdue rooms | `__tests__/ChatList.test.tsx` | component | PASS |
| 13 | Assigned tab shows "Assigned to Agent Demo" + recorded breach, no Claim; closed rooms have no Claim | `__tests__/ChatList.test.tsx` | component | PASS |

## Coverage
- Backend (`go tool cover -func`): `applyClaim` 100%, `Claim` 100%, `validRoomID` 100%, `claimInFirestore` **0%**.
- Frontend (new files): `sla.ts` 100%, `claim.ts` 100%, `SlaBadge.tsx` 100%, `useSlaBreached.ts` 100% lines / 92% branches, `ChatList.tsx` 90.5% lines (uncovered lines are pre-existing `NewRoomForm`).
- Package totals are lower (backend handlers 33%, frontend all-files 47%) because pre-existing `Create`/`List`, `ChatWindow`, `Header` etc. had no tests before this change.

## Known gaps
- `claimInFirestore` (the transaction that enforces single-claim under concurrency) is not covered: no Firestore emulator is available in this environment (`firebase`/`gcloud` CLI absent). Follow-up: emulator-backed integration test that races two claims and asserts exactly one 200 and one 409.
- No E2E (Playwright) test; not set up in this repo.
- No auth: `agentName` is client-supplied (accepted per ticket, "Agent Demo" until login exists).
