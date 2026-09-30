# TDD Evidence: Internal Room Notes

**Source plan**: inline `/ecc:plan` output in the session (no `.plan.md` file), approved with:
Risk 1 → use a design-system yellow if one exists (none does, so a `--color-warning` token was added);
Risk 2 → 500 Unicode characters (runes) after trimming.

## User journeys
1. As a support agent, I can add a private note to a room so colleagues see the context.
2. As a support agent, I can flag a note as important so it stands out.
3. As a support agent, I see a room's notes newest first, with the time each was written.
4. As a support agent, I see why a note was rejected (the backend's error message).
5. As a customer, I never see internal notes. They live only in `rooms/{id}/notes` and are served only by the agent API, never through `messages`.

## Checkpoint commits (branch `run/F1-C2`)
| Stage | Commit | Evidence |
|---|---|---|
| Backend RED | `47ea24c` | `go test ./handlers/` → build failed: `undefined: Note, NoteStore, NewNoteHandler` |
| Backend GREEN | `ba00930` | `go test ./handlers/` → ok; `notes.go` 100% statements |
| Backend refactor | `e01859a` | Store errors wrapped; emulator-gated store tests added (skipped here) |
| Frontend RED | `9d364ff` | `vitest run` → 7 failed / 1 passed: `fetchNotes is not a function`, no `tab` "Chat"/"Notes", `@/components/NotesPanel` missing |
| Frontend GREEN | `6e9f40f` | `vitest run` → 20 passed; `tsc --noEmit` clean; `next build` ok |
| Fix + refactor | `33d2901` | RED `undefined: isValidDocID` → GREEN, 52 Go test cases passing (including subtests); vitest 20 passing |
| Review fix (HIGH) | this commit | Split `RoomChat` (77→17 lines) and `NoteForm` (61→42 lines) to meet the 50-line rule; behaviour unchanged, vitest 20/20 before and after, `tsc` + `next build` ok |

## Test specification
| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | POST returns 201 with `{id, content, isImportant, createdAt}` | `notes_test.go:TestCreateNote_Success`, `…ResponseUsesCamelCaseFields` | integration (httptest) | PASS |
| 2 | Content is trimmed; 1–500 runes; 500 emoji accepted, 501 rejected | `TestCreateNote_Success`, `TestCreateNote_InvalidInput` | integration | PASS |
| 3 | Missing / null / non-string content → 400 | `TestCreateNote_InvalidInput` | integration | PASS |
| 4 | `isImportant` defaults to false; string / number / null → 400 | `TestCreateNote_Success`, `TestCreateNote_InvalidInput` | integration | PASS |
| 5 | `createdAt` is server-set; a client-supplied `createdAt` is ignored | `TestCreateNote_ClientSuppliedCreatedAtIsIgnored` | integration | PASS |
| 6 | Malformed, non-object or >1 MiB body → 400 `{"error": …}` | `TestCreateNote_InvalidInput`, `…OversizedBodyIsRejected` | integration | PASS |
| 7 | Missing room → 404 on GET and POST (404 takes precedence over 400) | `TestCreateNote_RoomNotFound*`, `TestListNotes_RoomNotFound` | integration | PASS |
| 8 | GET returns 200, newest first; `[]` when empty | `TestListNotes_ReturnsNotesNewestFirst`, `…EmptyRoomReturnsEmptyArray` | integration | PASS |
| 9 | Store failures → 500 with a generic message (no internal leak) | `TestCreateNote_StoreFailure…`, `…AddFailure…`, `TestListNotes_StoreFailuresReturn500` | integration | PASS |
| 10 | Room ids that are not a single legal Firestore doc ID (`a/b`, `..`, `__x__`, >1500 B) are rejected → 404 | `notes_store_test.go:TestIsValidDocID` | unit | PASS |
| 11 | Firestore store round-trips notes, orders `createdAt desc`, detects rooms | `TestFirestoreNoteStore_*` | integration (emulator) | **SKIPPED**: no emulator available |
| 12 | API client hits `/api/rooms/{encoded id}/notes`, POSTs JSON, surfaces backend `error` | `__tests__/api.notes.test.ts` | unit | PASS |
| 13 | Notes tab lists notes in API order, with a `<time>` for each | `__tests__/NotesPanel.test.tsx` | component | PASS |
| 14 | Important notes show the yellow "Important" banner; others don't | `NotesPanel.test.tsx:highlights important notes…` | component | PASS |
| 15 | Submit prepends the note without reloading, clears input and checkbox | `NotesPanel.test.tsx:adds a submitted note…` | component | PASS |
| 16 | A failed submit shows the backend message and keeps the input | `NotesPanel.test.tsx:shows the backend error…` | component | PASS |
| 17 | Chat tab selected by default; Notes loads only when opened; switching works | `__tests__/ChatWindow.test.tsx` | component | PASS |

## Coverage
- `backend/handlers/notes.go`: 100% of statements. `isValidDocID`: 100%.
- `backend/handlers/notes_store.go` (Firestore I/O): 0% here. It's covered by the emulator tests, which need `FIRESTORE_EMULATOR_HOST`.
- `frontend/components/NotesPanel.tsx`: 100% of lines, 93% of branches.
- `ChatWindow.tsx` 63% and `api.ts` 63%: the uncovered lines are pre-existing code (`Composer`, `MessageBubble`, `fetchRooms`, `createRoom`, `checkHealth`). All new lines are covered.

## Known gaps
- `go test -race` can't run on this Windows machine: the race runtime exits `0xc0000139` before any test runs.
- The Firestore emulator isn't installed, so rows 11 and the store I/O are unverified here. Run: `firebase emulators:start --only firestore`, then `FIRESTORE_EMULATOR_HOST=localhost:8080 go test ./handlers/`.
- No Playwright E2E test or manual browser check yet; the flow is covered at component level only.
- There's no auth in the app, the same as the existing endpoints. Firestore security rules for `rooms/*/notes` aren't in this repo.
