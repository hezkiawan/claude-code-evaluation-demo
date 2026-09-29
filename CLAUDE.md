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
