# Mini-Kouventa

Simplified omnichannel customer-support inbox (evaluation testbed).

## Stack
- backend/: Go (net/http), Firestore via Firebase Admin SDK. Entry: backend/main.go, handlers in backend/handlers/.
- frontend/: Next.js 14 (App Router), React 18, TypeScript, Tailwind.

## Commands
- Backend: `cd backend && go run .` · tests: `go test ./...`
- Frontend: `cd frontend && npm run dev` · tests: `npm test` · types: `npm run typecheck`

## Rules
- Frontend UI must follow .claude/rules/frontend-design-system.md.
- Do not commit secrets (.env files, serviceAccountKey.json).

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
