# 03: Agents can flag a note as Important and see it highlighted

**What to build:** When creating an Internal Note, an Agent can tick an "Important" checkbox. Important notes stand out in the Notes list: the card gets a yellow accent banner (a 4px left border) and a small yellow "Important" label, so the meaning doesn't depend on color alone. The flag is set only at creation and can never be changed (see `CONTEXT.md`). The API gains an optional `isImportant` boolean that defaults to false and must be a real JSON boolean. The design system has no yellow, so this ticket adds one semantic (non-brand) warning token and registers it in the design-system rules. See `../spec.md` (API contract, Design system).

**Blocked by:** 01 (Agents can add and list plain Internal Notes on a Room).

**Status:** ready-for-agent

- [ ] POST accepts an optional `isImportant`. If it is absent, the note is stored and returned with `isImportant: false`. If it is `true` or `false`, the value is stored and returned as sent.
- [ ] `isImportant` given as `null`, as the string `"true"`, or as the number `1` returns 400 `{"error": "isImportant must be a boolean"}`.
- [ ] GET returns `isImportant` on every note, including notes stored without the field (treated as `false`).
- [ ] A `--color-warning: #FFC107` token is defined in both the light and the dark token scopes, mapped as `warning` in the Tailwind theme, and registered in the frontend design-system rules (colors table and the status mapping: warning/important → `#FFC107`).
- [ ] The Notes form has an "Important" checkbox with the primary accent color. It is sent with the submit and resets to unchecked after a successful submit. After a failed submit it keeps its state.
- [ ] Important note cards show the warning-colored 4px left border and an "Important" label. Non-Important cards show neither.
- [ ] Components reference the `warning` token only, never a raw hex value.
- [ ] Backend tests: the default is false; `true` round-trips through POST and GET; `null`, `"true"` and `1` → 400.
- [ ] Frontend tests: an Important note renders the label and banner and a normal note doesn't; a submit with the box ticked sends `isImportant: true` and the box resets afterwards.
- [ ] `go test ./...`, `npm test` and `npm run typecheck` pass.
