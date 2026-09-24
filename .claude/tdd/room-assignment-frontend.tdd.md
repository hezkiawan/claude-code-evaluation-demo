# TDD Evidence: Room Assignment UI (frontend)

**Source plan:** inline `/ecc:plan` output (2026-09-24), Phases 3–4. Backend counterpart: [room-assignment.tdd.md](room-assignment.tdd.md).
**Decision carried over:** expired chats remain assignable (server stores `slaBreached: true`).

## User journeys
1. As an agent, I want an **Assign** button on each waiting chat tile, so I can claim it from the list.
2. As an agent, I want a red **Expired** badge on chats waiting > 5 minutes that appears live without a reload, so I can prioritize them.
3. As an agent, I want an assigned chat to leave the Idle/Bot list and show up under **Assigned**.
4. As an agent, I want a failed assign (e.g. someone else took it) to show the reason and leave the chat in place.

## Test runner (Step 0)
The project had no frontend test runner. Added Vitest 3 + React Testing Library + jsdom (`npm test`, `npm run test:coverage`).
Vitest 5 was rejected: it needs `@types/node >= 22`, but the project pins `^20`.

## Checkpoints (branch `eval/everything-claude-code`)
| Stage | Commit | Evidence |
|---|---|---|
| RED | `4dfe3a0` test: add failing frontend tests… | `npm test` → 14 failed / 2 passed (pre-existing guards), plus `lib/sla.test.ts` "Failed to resolve import ./sla". Failures: `assignRoom` not a function, no `Assign <name>` button, no `Expired` text |
| GREEN | `0c0a72b` feat: add Assign button, Expired SLA badge… | `npm test` → 4 files, 24 tests pass, 0 act() warnings; `npm run typecheck` clean; `npm run build` ok |
| Refactor | skipped | Small diff, no duplication |

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Client SLA is 5 min; ≤ 5:00 not expired, > 5:00 expired; bot chats too | `lib/sla.test.ts` | unit | PASS |
| 2 | Assigned/closed chats never show as expired, even if the server flag is set | `lib/sla.test.ts` | unit | PASS |
| 3 | Server `expired` flag wins when the client clock runs behind | `lib/sla.test.ts` | unit | PASS |
| 4 | `assignRoom` POSTs to `/api/rooms/:id/assign`, URL-encodes the id, returns the room | `lib/api.test.ts` | unit (fetch stubbed) | PASS |
| 5 | `assignRoom` rejects with the server's error message (e.g. 409) | `lib/api.test.ts` | unit | PASS |
| 6 | `StatusBadge expired` renders a red (`bg-danger`, white text) "Expired" pill in place of the status | `components/StatusBadge.test.tsx` | component | PASS |
| 7 | Every idle/bot tile has an accessible "Assign &lt;name&gt;" button | `ChatList.test.tsx` | component | PASS |
| 8 | Assign button is not nested inside the tile's select button | `ChatList.test.tsx` | component | PASS |
| 9 | Assigning removes the chat from the Idle list and does not select it | `ChatList.test.tsx` | component | PASS |
| 10 | Button is disabled while the request is in flight | `ChatList.test.tsx` | component | PASS |
| 11 | On failure the chat stays, the error shows in a `role="alert"`, and the button re-enables | `ChatList.test.tsx` | component | PASS |
| 12 | Assigning the open chat updates it via `onSelect(updated)` | `ChatList.test.tsx` | component | PASS |
| 13 | The Assigned tab fetches `status=assigned` and shows no Assign buttons or Expired badges | `ChatList.test.tsx` | component | PASS |
| 14 | A chat assigned from Idle appears under Assigned | `ChatList.test.tsx` | component | PASS |
| 15 | Only chats waiting > 5 min show Expired; expired chats remain assignable | `ChatList.test.tsx` | component | PASS |
| 16 | Expired appears within 15 s of the SLA passing, without a refetch (fake clock) | `ChatList.test.tsx` | component | PASS |

## Coverage and known gaps
`npm run test:coverage` (v8):

| File | Stmts | Branch |
|---|---|---|
| `lib/sla.ts` | 100% | 100% |
| `components/StatusBadge.tsx` | 100% | 100% |
| `components/ChatList.tsx` | 90.05% | 86.04% |
| All files | 44.72% | 79.74% |

The uncovered lines in `ChatList.tsx` are the pre-existing `NewRoomForm` and `handleCreated`. The uncovered lines in `api.ts` are the pre-existing `fetchRooms`/`createRoom`/`checkHealth`. The low overall total comes from untouched files with no tests (`ChatWindow`, `Header`, `Sidebar`). These are out of scope for this change.

**Not verified:**
- **Browser/E2E pass against the live Go API:** the backend talks to the real Firebase project via `serviceAccountKey.json`, so running it would write test rooms to that project's Firestore. This is left for a manual check or an emulator setup.
- **Visual check of the Assign button placement against `frontend-design-reference/screenshot-1.png`.**
