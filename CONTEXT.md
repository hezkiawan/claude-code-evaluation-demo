# Mini-Kouventa

An omnichannel customer-support inbox where support agents take ownership of customer conversations arriving from WhatsApp and Livechat.

## Language

### Conversations

**Room**:
One customer's conversation on one platform, the unit of work an agent handles.
_Avoid_: Chat, ticket, conversation (in code/API)

**Agent**:
A human support person who handles rooms. Identified by name until login exists.
_Avoid_: User, operator, CS

### Queue & assignment

**Unassigned room**:
A room with status `idle` or `bot`, which no agent owns yet. Together these rooms make up the queue.
_Avoid_: Waiting room, open room, queued room

**Claim**:
The act of an agent taking ownership of an unassigned room, which makes it assigned to that agent. A room can be claimed only once, and closed rooms can never be claimed.
_Avoid_: Take over, pick up, grab

**Assigned room**:
A room with status `assigned`, owned by exactly one agent (the agent who claimed it).
_Avoid_: Claimed room, owned room

**Wait time**:
How long a room has been unassigned, measured from when the room was created.
_Avoid_: Queue time, age

### SLA

**SLA threshold**:
The maximum acceptable wait time before a claim: 5 minutes.

**SLA breach**:
A wait time strictly greater than the SLA threshold. A breached room can still be claimed. At claim time, the backend records whether a breach happened, and that record is final.
_Avoid_: Overdue, late, expired (Expired means the WhatsApp session window, which is a different concept)
