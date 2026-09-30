# Spec: Internal Notes on Rooms

Status: ready-for-agent

## Problem Statement

Agents working a Room have nowhere to write down context for themselves or their colleagues, such as "customer already refunded once", "escalated to billing" or "prefers Bahasa Indonesia". Today the only text attached to a Room is Messages, and every Message is part of the conversation with the Customer. Agents either keep this context in their heads or in outside tools, or they risk writing it where the Customer could see it. When a Room is handed over to another Agent or reopened later, that context is lost.

## Solution

Agents can attach **Internal Notes** to a Room. An Internal Note is a private, append-only annotation that is never sent to the Customer and is not a Message. In the chat window of the selected Room there are two tabs: **Chat**, the existing Message view and the default, and **Notes**. The Notes tab lists the Room's Internal Notes, newest first, each with its content and the date and time it was written. Notes flagged **Important** stand out with a yellow accent banner. Below the list, an inline form lets the Agent write a note, optionally mark it Important, and submit it. The new note appears at the top of the list immediately, without reloading the page. If the submit is rejected, the backend's error message is shown.

## User Stories

1. As an Agent, I want to write an Internal Note on a Room, so that context about the Customer is kept alongside the conversation.
2. As an Agent, I want Internal Notes never to be sent to the Customer, so that I can write candidly without it becoming part of the conversation.
3. As an Agent, I want Internal Notes kept separate from Messages, so that I never confuse what the Customer saw with what colleagues wrote.
4. As an Agent, I want a "Chat" tab and a "Notes" tab in the chat window of the selected Room, so that I can switch between the conversation and the notes without leaving the Room.
5. As an Agent, I want the "Chat" tab selected by default when I open a Room, so that my usual workflow of reading and replying is unchanged.
6. As an Agent, I want the chat window to go back to the "Chat" tab when I select a different Room, so that I don't accidentally look at one Room's notes while thinking about another.
7. As an Agent, I want the message composer hidden while I'm on the Notes tab, so that I can't accidentally send a note's text to the Customer.
8. As an Agent, I want to see all Internal Notes of the Room, newest first, so that the most recent context is what I read first.
9. As an Agent, I want each Internal Note to show its full content, including line breaks and emoji, so that nothing I or a colleague wrote is lost.
10. As an Agent, I want each Internal Note to show the date and time it was created, so that I can tell how fresh the context is, even for notes that are days old.
11. As an Agent, I want to mark an Internal Note as Important when I create it, so that critical context stands out to colleagues.
12. As an Agent, I want Important notes highlighted with a yellow accent banner and an "Important" label, so that I notice them at a glance without relying on color alone.
13. As an Agent, I want non-Important notes to look like normal cards, so that the highlight keeps its meaning.
14. As an Agent, I want an inline form below the notes list with a text input, an "Important" checkbox and a submit button, so that I can add a note without leaving the tab.
15. As an Agent, I want my new note to appear at the top of the list as soon as it is saved, without a page reload, so that I get immediate confirmation.
16. As an Agent, I want the text input cleared after a successful submit, so that I can write the next note right away.
17. As an Agent, I want the "Important" checkbox reset to unchecked after a successful submit, so that my next note isn't flagged Important by accident.
18. As an Agent, I want the submit button disabled while the input is empty or whitespace-only, so that I don't send blank notes.
19. As an Agent, I want the submit button disabled while a note is being saved, so that I don't create duplicates by clicking twice.
20. As an Agent, I want a live character counter out of 500, so that I know how much room I have left.
21. As an Agent, I want the counter to count an emoji as one character, like the backend does, so that the counter and the server agree.
22. As an Agent, I want the counter to turn red when I go over 500 characters, so that I can shorten the note before submitting.
23. As an Agent, I want to see the backend's error message when a submit fails, so that I understand what to fix.
24. As an Agent, I want my typed text kept when a submit fails, so that I don't lose my work.
25. As an Agent, I want a loading indicator while notes are being fetched, so that I know an empty list isn't final yet.
26. As an Agent, I want a clear empty state ("No internal notes yet") when a Room has no notes, so that I know there's nothing I'm missing.
27. As an Agent, I want an error message if the notes can't be loaded, so that I don't mistake a failure for an empty Room.
28. As an Agent, I want to add Internal Notes to a Room in any Status, including closed, so that I can record follow-up context after the conversation ends.
29. As an Agent, I want leading and trailing whitespace stripped from my note, so that stray spaces and newlines don't pad the stored content.
30. As an API client, I want `POST /api/rooms/{id}/notes` to return 201 with the created note, so that I can show it without a second request.
31. As an API client, I want `GET /api/rooms/{id}/notes` to return a JSON array newest first, and an empty array when there are none, so that I never have to handle null.
32. As an API client, I want a 404 with a JSON error when the Room does not exist, on both endpoints, so that I can tell a wrong Room apart from an empty one.
33. As an API client, I want a 400 with a specific JSON error message for every kind of invalid input, so that I can show a useful message.
34. As an API client, I want `isImportant` to be optional and default to false, so that simple clients only need to send `content`.
35. As an API client, I want the server, not me, to set `createdAt`, so that the note order can't be manipulated or skewed by client clocks.
36. As a design-system owner, I want the yellow highlight to come from a registered semantic token, so that the design system remains the single source of truth for colors.

## Implementation Decisions

**Domain language**: The canonical term is **Internal Note**, with "Note" as shorthand in code and UI. See `CONTEXT.md`. An Internal Note is append-only: it cannot be edited or deleted, and the Important flag is fixed at creation. It has no author, because there is no Agent identity in the system yet.

**Storage**: Internal Notes live in the Firestore subcollection `rooms/{roomId}/notes`. Each document has `content` (string), `isImportant` (boolean) and `createdAt` (timestamp). The document ID is the note ID, and it is not stored as a field.

**API contract**

- `POST /api/rooms/{id}/notes`
  - Request body: `{"content": string, "isImportant"?: boolean}`. The body is capped at 1 MB, like room creation.
  - Success: `201` with `{"id": string, "content": string, "isImportant": boolean, "createdAt": RFC 3339 timestamp}`.
- `GET /api/rooms/{id}/notes`
  - Success: `200` with a JSON array of the note shape above, newest first. It is `[]` when there are no notes and never `null`.
- Errors on both endpoints use the existing format `{"error": "<message>"}`.

**Validation rules (POST)**, checked in this order:

1. The body is not valid JSON (including a non-object top level) → 400 `invalid JSON body`.
2. `content` is missing, `null` or not a string → 400.
3. `content` is trimmed with Unicode-aware whitespace trimming (Go's standard trim-space semantics). The trimmed length is then counted in **Unicode code points**, so 😀 counts as 1, while composite emoji such as 👍🏽 count as their code points. Empty after trimming (including whitespace-only) → 400. More than 500 → 400. One shared message is fine, e.g. `content is required (1-500 characters)`.
4. `isImportant`, if present, must be a JSON boolean. `null`, strings such as `"true"`, and numbers → 400 `isImportant must be a boolean`. If it is absent it defaults to `false`.
5. Unknown fields are ignored, consistent with `POST /api/rooms`.
6. The stored and returned `content` is the **trimmed** value.

The Room existence check (404 `room not found`) runs on both endpoints. For POST, it may run before or after body validation. The chosen order is: validate the body first (cheap, no I/O), then check the Room, so that a bad body on a missing Room gets a 400. This order is documented by tests.

**createdAt**: set by the Go server as the current UTC time when the note is created. Any client-supplied value is ignored.

**Ordering**: newest first by `createdAt`. Ties are broken deterministically by note ID, descending. A single-field descending order on the subcollection needs no composite index.

**Backend modules**

- A new notes handler module that follows the shape of the existing rooms handler: a handler struct with `Create` and `List` methods, registered in the main mux with Go 1.22 method-and-path patterns (`POST /api/rooms/{id}/notes`, `GET /api/rooms/{id}/notes`). The room ID comes from the path value.
- **New seam — `NoteStore` interface**: the handler depends on a small interface instead of the concrete Firestore client:
  - `RoomExists(ctx, roomID) (bool, error)`
  - `CreateNote(ctx, roomID, note) (Note, error)`, which assigns the ID
  - `ListNotes(ctx, roomID) ([]Note, error)`, newest first
  A Firestore-backed implementation is wired in main. This is the only new seam, and it exists so that validation and HTTP behavior can be tested without Firestore.
- Validation lives in a pure function (body bytes → validated input or error message) that the handler calls. It is tested through the handler, not directly.
- Store failures → 500 with a generic JSON error (`failed to create note` / `failed to fetch notes`). The detail is logged server-side only.
- CORS needs no change, since GET and POST are already allowed.

**Frontend modules**

- `Note` type: `{ id: string; content: string; isImportant: boolean; createdAt: string }`, where `createdAt` is ISO, matching how `Room.createdAt` is typed.
- API client: `fetchNotes(roomId)` and `createNote(roomId, content, isImportant)` in the existing API module. They reuse its shared request helper, which already surfaces the backend's `error` message as the thrown `Error.message`.
- The chat window for a selected Room gets a `Chat | Notes` tab bar directly under the Room header, reusing the existing `Tabs` component (green active underline on the panel background). The Chat tab renders exactly today's message canvas and composer. The Notes tab renders a new **Room Notes** component in place of both the canvas and the composer. The per-Room component is already keyed by Room ID, so the tab state resets to Chat when the Room changes.
- **Room Notes component** (takes `roomId`):
  - It is mounted only while the Notes tab is active and fetches the notes on mount, so every time the tab is opened the list is fresh. It shows loading, empty and load-error states.
  - The list sits on the raised canvas background. Each note is a panel card (~8px radius, `shadow-md`) with white, pre-wrapped, word-breaking content, and below it a muted `<time dateTime=ISO>` showing the full local date and time (e.g. "30 Sep 2026, 14:05").
  - An Important note gets a 4px left border in the warning color and a small "Important" label in the warning color at the top of the card.
  - The form sits in the footer slot (panel background, top divider), styled like the existing composer. It has a text input ("Add an internal note…", no hard `maxLength`), an "Important" checkbox with `accent-color` set to the primary color, a live `n/500` counter (code points) that turns danger-colored above 500, and a primary submit button ("Add note").
  - Submit is disabled while the trimmed input is empty or a request is in flight.
  - On success, the returned note is prepended to the list, and the input and checkbox are reset.
  - On failure, the thrown message is shown in danger color under the form, and the input and checkbox are kept.
- A date-time formatting helper is added next to the existing clock-time and relative-time helpers.

**Design system**: The design system defines no warning or yellow color. Add one semantic (non-brand) token, `--color-warning: #FFC107`, in both the light and the dark token scopes. Map it in Tailwind as `warning` and register it in the frontend design-system rules (colors table and status badge mapping: warning/important → `#FFC107`). Components reference the token, never raw hex values.

## Testing Decisions

**What makes a good test here**: tests exercise external behavior only. For the backend that means HTTP requests in and status code plus JSON body out. For the frontend it means what an Agent sees and does (rendered text, roles, typing, clicking). No assertions on internal state, private functions or call order beyond what an observer can see.

**Backend — tested at the HTTP seam** with the standard library's `httptest`. Tests go through the real mux patterns (so path-value extraction is covered) and use an in-memory fake `NoteStore`. Cases:

- POST happy path → 201, trimmed content, `isImportant` default false, server-set `createdAt`, non-empty ID. A subsequent GET includes the note.
- `isImportant: true` round-trips.
- Content boundaries: exactly 500 ASCII → 201. 501 → 400. 500 × 😀 → 201. 501 × 😀 → 400. Content padded with whitespace to over 500 raw but ≤500 after trimming → 201.
- Empty string, whitespace-only (spaces, tabs, newlines), missing `content`, `null` content, numeric content → 400.
- `isImportant` as `"true"`, `1` and `null` → 400.
- Malformed JSON → 400.
- Every error response has the `{"error": ...}` shape and the JSON content type.
- Unknown Room → 404 on both GET and POST.
- GET on a Room with no notes → 200 `[]` (literally an empty array, not `null`).
- GET ordering: newest first, with a deterministic tie-break.
- Store failure → 500 with a JSON error.
- Prior art: none in the backend yet. These are the first Go tests (`go test ./...`).

**Frontend — tested at the existing API-module seam** with Vitest and Testing Library. The API module is mocked with `vi.mock`, and the Room Notes component is rendered directly. Cases:

- Loading, then the list renders newest first with content and time.
- Empty state.
- Load error.
- An Important note shows the "Important" label/banner, and a normal note doesn't.
- Submit is disabled for empty or whitespace-only input.
- A successful submit calls the API with the trimmed content and flag, the new note appears at the top, and the input clears and the checkbox unchecks.
- A failed submit shows the backend's message and keeps the input.
- The counter counts an emoji as 1.

Tab behavior (Chat is the default, switching shows Notes and hides the composer) is tested by rendering the chat window with the Firebase modules mocked, if that stays light. Otherwise it is covered manually.

- Prior art: the existing smoke test (Testing Library render + jest-dom matchers).
- Type safety is verified with `npm run typecheck`.

## Out of Scope

- Firestore security rules. Enforcing that client SDKs cannot read `rooms/{roomId}/notes` directly is not part of this work. "Customers never see notes" is guaranteed here only in the sense that notes are never part of the Message stream or sent on any Platform.
- Authentication, Agent identity and note authorship.
- Editing or deleting notes, or changing the Important flag after creation.
- Real-time updates or polling. Notes added by another Agent appear the next time the Notes tab is opened.
- Pagination of notes.
- Notes counts or badges on the tab or in the chat list.
- Multi-line (textarea) note input. The spec calls for a text input. Newlines in API-created content still render correctly.

## Further Notes

- "Unicode characters" is interpreted as **code points**, not grapheme clusters. This is a deliberate simplification: grapheme counting would need an extra Go dependency. The frontend counter must use the same definition (spread the string into code points, not `.length`) so that it never disagrees with the backend.
- The existing room-name validation counts bytes, not characters. That's inconsistent with this feature, but it is not changed here.
