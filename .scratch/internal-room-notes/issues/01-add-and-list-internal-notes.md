# 01: Agents can add and list plain Internal Notes on a Room

**What to build:** This is the tracer bullet for Internal Notes (see `../spec.md` and `CONTEXT.md`). An Agent selects a Room, switches from the default "Chat" tab to a new "Notes" tab, and sees that Room's Internal Notes, newest first, each with its content and full date and time. Using an inline form below the list, the Agent types a note and submits it. The saved note appears at the top of the list without a page reload, and the input clears. If the submit fails, the backend's error message is shown. Internal Notes are never part of the Message stream.

Behind this, the API gains `POST /api/rooms/{id}/notes` and `GET /api/rooms/{id}/notes`. Notes are stored in the Firestore subcollection `rooms/{roomId}/notes`. The handler depends on a new, small `NoteStore` interface with three operations: check that a Room exists, create a note, and list notes newest first. A Firestore implementation is wired in at startup. This interface is the test seam.

Validation in this ticket is basic only: invalid JSON → 400, `content` must be a string, and content that is empty after trimming → 400. The 500-code-point limit, strict `null` handling and the counter belong to ticket 02. `isImportant` belongs to ticket 03. POST validates the body before checking that the Room exists.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `POST /api/rooms/{id}/notes` with `{"content": "  hello  "}` returns 201 and `{id, content: "hello", createdAt}`. The server sets `createdAt` to the current UTC time and ignores any value the client sends.
- [ ] `GET /api/rooms/{id}/notes` returns 200 and a JSON array, newest first, with ties broken deterministically by note ID descending. It returns `[]` (never `null`) when the Room has no notes.
- [ ] Both endpoints return 404 `{"error": "room not found"}` for a Room that does not exist.
- [ ] Invalid JSON, missing or non-string `content`, and empty or whitespace-only `content` each return 400 with an `{"error": "..."}` body.
- [ ] Notes can be added to a Room in any Status, including closed.
- [ ] Store failures return 500 with a generic JSON error. The details are logged only on the server.
- [ ] The chat window of the selected Room has "Chat" and "Notes" tabs directly under the Room header, built with the existing Tabs component. Chat is selected by default, and switching Rooms resets to Chat.
- [ ] On the Notes tab, the Message composer is hidden and the Chat view is unchanged.
- [ ] The Notes tab fetches notes each time it opens and shows loading, empty ("No internal notes yet") and load-error states.
- [ ] Each note is a panel card on the raised canvas. Its content is white and pre-wrapped, with the full local date and time in a muted `<time dateTime=ISO>` element below it.
- [ ] The form has a text input and an "Add note" button. The button is disabled while the trimmed input is empty or a request is in flight. On success the returned note is added to the top of the list and the input clears. On failure the backend's error message is shown in the danger color and the input keeps its text.
- [ ] All styling uses design-system tokens and no raw hex values.
- [ ] Backend: `httptest` tests go through the real routes, using a fake `NoteStore`. They cover the 201 happy path with trimming, GET after POST, empty `[]`, newest-first ordering, 404 on both endpoints, the basic 400s, and 500 on a store failure.
- [ ] Frontend: Vitest and Testing Library tests, with the API module mocked, cover loading → list, the empty state, the load error, a successful submit (note added to the top, input cleared) and a failed submit (message shown).
- [ ] `go test ./...`, `npm test` and `npm run typecheck` pass.
