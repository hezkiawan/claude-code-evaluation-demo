# 02: SLA breach: recorded on claim, shown live on unassigned rooms

**What to build:** customers shouldn't wait more than 5 minutes (the SLA threshold) before an agent claims their room. The wait time counts from when the room was created. A room has an **SLA breach** when its wait time is strictly greater than 5:00; a wait of exactly 5:00 is not a breach.

- **On claim:** the backend records the wait time and whether the SLA was breached, using its own clock. That record is final. Breached rooms can still be claimed.
- **Before a claim:** unassigned rooms (status `idle` or `bot`) that have waited more than 5:00 show a red "SLA breached" badge in the chat list. It appears live, within about a second of the room crossing 5:00, with no refresh.
- **No badge:** assigned and closed rooms never show it.

Spec: `.scratch/agent-room-claim/spec.md`. Vocabulary: `CONTEXT.md` (Wait time, SLA threshold, SLA breach). Don't call this "Expired": that word means the WhatsApp session window.

**Blocked by:** 01 (An agent claims an unassigned room)

**Status:** ready-for-agent

- [ ] The claim domain function also sets `waitSeconds` (whole seconds from `createdAt` to `claimedAt`) and `slaBreached` (wait strictly greater than 5 minutes) on the claimed room.
- [ ] Room JSON includes `waitSeconds` and `slaBreached` when set and leaves them out otherwise. Rooms that haven't been claimed, or predate this feature, still load.
- [ ] The frontend has one shared helper that decides whether a room is breached at a given "now", using the same strict > 5:00 rule.
- [ ] The chat list's "now" ticks every second instead of every 60 seconds.
- [ ] Idle and Bot tiles whose wait is over 5:00 show an "SLA breached" pill (`bg-danger`, white text, same pill shape as the status badge). No new colours are introduced.
- [ ] Assigned and Closed tiles never show the SLA pill.
- [ ] Go table tests cover the boundary: 4:59 and exactly 5:00 are not breached, 5:01 is breached, and `waitSeconds` is correct.
- [ ] A ChatList test with fake timers and stubbed `fetch` shows the pill is absent at 5:00 and appears after time passes 5:00, with no refetch. Another shows it never appears on an assigned room.
- [ ] `go test ./...`, `npm test` and `npm run typecheck` pass.
