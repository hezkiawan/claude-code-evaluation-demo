# 02: Content rules match the spec exactly (500-character limit counted in Unicode characters)

**What to build:** An Agent writing an Internal Note can see how many characters they have left, and the limit is enforced by the backend. After trimming, content must be 1 to 500 Unicode code points: 😀 counts as 1, and composite emoji count as the number of code points they contain. The Notes form shows a live `n/500` counter that uses the same counting rule as the backend, so the two never disagree. The counter turns red when the note is over the limit. If the Agent submits anyway, the backend's 400 message is shown and the text is kept, so the Agent can shorten it. See `../spec.md` (Validation rules, Further Notes).

**Blocked by:** 01 (Agents can add and list plain Internal Notes on a Room).

**Status:** ready-for-agent

- [ ] After trimming, content longer than 500 code points returns 400 with a specific message (e.g. `content is required (1-500 characters)`).
- [ ] `"content": null` returns 400. Missing, numeric and other non-string content still return 400.
- [ ] Trimming uses Unicode-aware whitespace semantics (spaces, tabs, newlines and other Unicode whitespace), and the trimmed value is what gets stored and returned.
- [ ] Unknown body fields are ignored, and the body is capped at 1 MB, the same as room creation.
- [ ] Every 400 response has the JSON content type and the `{"error": "..."}` shape.
- [ ] The text input has no hard `maxLength`. A live `n/500` counter counts code points, not UTF-16 length, and turns danger-colored above 500.
- [ ] The submit button stays disabled for whitespace-only input. When a submit is rejected, the backend's message is shown and the typed text is kept.
- [ ] Backend tests: 500 ASCII → 201 and 501 → 400; 500 × 😀 → 201 and 501 × 😀 → 400; content longer than 500 before trimming but at most 500 after → 201; empty string, whitespace-only (spaces, tabs, newlines), `null` and number content → 400; error bodies have the JSON shape.
- [ ] Frontend tests: the counter counts an emoji as 1; the counter goes into the danger style above 500; a rejected submit shows the backend's message and keeps the input.
- [ ] `go test ./...`, `npm test` and `npm run typecheck` pass.
