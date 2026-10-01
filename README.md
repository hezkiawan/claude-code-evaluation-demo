# mini-kouventa (claude-code-evaluation-demo)

A small Kouventa-style customer support inbox, built as the **test bed** for evaluating Claude Code plugins
(Everything Claude Code, Matt Pocock skills) against plain Claude Code.

- **Evaluation notebook** (prompts, checkers, run cards, results, report): [hezkiawan/claude-code-eval](https://github.com/hezkiawan/claude-code-eval)
- **Full report:** [EVALUATION-REPORT.md](https://github.com/hezkiawan/claude-code-eval/blob/main/docs/EVALUATION-REPORT.md)

> This repo is a test app, not production code. There is no login; the current agent is hard-coded as "Agent Demo".

---

## Architecture

```
Browser (Next.js, :3000)
 ├─ rooms: list / create ──► Go API (:8080) ──► Firestore  "rooms"
 └─ chat messages ─────────────────────────► Firestore  "rooms/{id}/messages"  (direct, live via onSnapshot)
```

| Part | Tech | Where |
|---|---|---|
| Backend | Go (`net/http`, Go 1.22 routing), Firebase Admin SDK | `backend/` (entry `main.go`, handlers in `backend/handlers/`) |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind | `frontend/` (`components/`, `lib/api.ts`, `lib/firebase.ts`) |
| Database | Firestore | `rooms` collection, `messages` subcollection per room |
| Tests | `go test`; Vitest + React Testing Library | `backend/**/_test.go`, `frontend/__tests__/` |
| Claude config | `CLAUDE.md`, `.claude/rules/frontend-design-system.md` | repo root |

**Room:** `name`, `platform` (`whatsapp` \| `livechat`), `status` (`bot` \| `idle` \| `assigned` \| `closed`), `createdAt`.

**API (baseline):** `GET /api/health` · `GET /api/rooms?status=…` · `POST /api/rooms` (CORS: `http://localhost:3000` only).

---

## Running it

Prerequisites: Go 1.22+, Node 20+, a Firebase project with Firestore.

**1. Backend**
```bash
# put your service account key at backend/serviceAccountKey.json (or set SERVICE_ACCOUNT_PATH)
cd backend
go run .            # http://localhost:8080
go test ./...
```

**2. Frontend**
```bash
cd frontend
# create .env.local with:
#   NEXT_PUBLIC_API_URL=http://localhost:8080
#   NEXT_PUBLIC_FIREBASE_API_KEY=...
#   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
#   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
#   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
#   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
#   NEXT_PUBLIC_FIREBASE_APP_ID=...
npm ci
npm run dev         # http://localhost:3000
npm test
```

⚠️ Never commit `serviceAccountKey.json` or `.env.local`.

---

## Branches and tags

The code of every evaluation run is kept on its own branch, so results can be inspected and diffed.

| Ref | What it is |
|---|---|
| `main` = tag **`eval-base-v2`** | Clean starting point for every run |
| tag `base-C1` / branch `setup/C1` | Starting point + Matt Pocock skills installed (project scope) |
| tag `base-C2` / branch `setup/C2` | Starting point + ECC 2.2.2 plugin + rules installed (project scope) |
| `run/F1-C0` · `run/F1-C1` · `run/F1-C2` | Ticket F1 (Room Notes) built by plain Claude Code · Matt Pocock · ECC |
| `run/F2-C0` · `run/F2-C1` · `run/F2-C2` | Ticket F2 (Claim + SLA) built by plain Claude Code · Matt Pocock · ECC |
| tags `pilot/*` | Archived early pilot runs (not part of the final evaluation) |

**The two tickets**
- **F1 Room Notes:** internal notes per room (API + Notes tab, hidden from customers, validation).
- **F2 Claim + SLA:** `POST /api/rooms/{id}/claim` with `{"agentName"}`; only one agent can win a room (Firestore transaction); records who/when; 5-minute SLA breach flag; Claim button + live "SLA breached" badge in the UI.

Compare runs, e.g.:
```bash
git diff eval-base-v2 run/F2-C2 -- backend/
git show run/F2-C1:backend/handlers/rooms.go
```

---

## Results in one line

All six runs passed the automated checks (F1 14/14, F2 11/11 including a 10-agents-at-once race test). The differences were in cost, process, tests and edge cases. See the [report](https://github.com/hezkiawan/claude-code-eval/blob/main/docs/EVALUATION-REPORT.md) and the [code analysis](https://github.com/hezkiawan/claude-code-eval/blob/main/docs/code-analysis.md).
