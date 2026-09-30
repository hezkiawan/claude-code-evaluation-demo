# Mini-Kouventa

An omnichannel customer-support inbox where Agents handle Customer conversations arriving from channels such as WhatsApp and live chat.

## Language

### Conversations

**Room**:
A single conversation between one Customer and the support team on one Platform, with a Status (assigned, idle, bot, closed).
_Avoid_: Chat, ticket, thread, conversation (in code)

**Message**:
A piece of text exchanged in a Room that is part of the conversation with the Customer, either inbound (from the Customer) or outbound (to the Customer).
_Avoid_: Chat, reply

**Internal Note**:
A private, append-only annotation that an Agent attaches to a Room. It is never sent to the Customer and is not a Message. It can be added to a Room in any Status, including closed. "Note" is acceptable shorthand.
_Avoid_: Comment, memo, private message, whisper

**Important** (Internal Note):
A flag an Agent sets when creating an Internal Note so the note stands out to other Agents. It cannot be changed after creation.
_Avoid_: Pinned, flagged, priority

### People

**Customer**:
The person on the other side of a Room, reached through a Platform.
_Avoid_: User, contact, client

**Agent**:
A support staff member working Rooms in the inbox. There is no Agent identity in the system yet.
_Avoid_: Operator, admin, user

### Channels

**Platform**:
The channel a Room arrives through: `whatsapp` or `livechat`.
_Avoid_: Channel (in code), source
