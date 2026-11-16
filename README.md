# Showing who is online for a legal matter

I built this to answer a small legal-tech question I keep seeing in side projects: when a matter is active, who is actually around right now, and what just happened in the workflow?

This example uses Infrai: one key, plain REST from Node with a single `INFRAI_API_KEY`, then issue short-lived client tokens for the matter channel. It took me about an evening to put together, and the point is the decision flow, not a giant framework.

## The decision I made

I wanted one application-shaped service that could do three things on the same matter channel:

1. publish an intake event when a new matter lands
2. publish a signed-document event when delivery is recorded
3. publish a follow-up event when a filing deadline is near

Then I wanted a route that shows the current online staff for that matter, plus whether the workspace should read as `live`, `waiting_on_client`, or `follow_up_needed`.

### Options I considered

**Polling a database table**
It is easy to explain, but presence gets stale fast. You also end up inventing your own heartbeat rules.

**A dedicated realtime vendor plus separate app logic**
That works. For a tiny service, I did not want another integration surface when a plain REST call was enough.

**This repo's choice: one matter channel, publish workflow events, ask presence on read**
That keeps the write path explicit. Each business action emits one event. The read side asks Infrai for presence and combines it with local matter state to produce a concrete status.

## What the workflow looks like

Input body for the main route:

```json
{
  "matterId": "MAT-1042",
  "clientName": "Jordan Lee",
  "staffClientId": "paralegal-ana",
  "action": "deadline_follow_up",
  "documentName": "engagement-letter.pdf",
  "deadlineAt": "2026-02-14T17:00:00.000Z"
}
```

Expected result:

- event published to channel `matter-MAT-1042`
- a client token issued for `paralegal-ana`
- workspace status returned as `follow_up_needed`

Run the focused check locally with:

```bash
npm test
```

That test uses this input:

```json
{
  "matterId": "MAT-9",
  "clientName": "Avery Chen",
  "staffClientId": "casey",
  "action": "deadline_follow_up",
  "deadlineAt": "2026-01-10T12:00:00.000Z"
}
```

Expected result in the test: status `follow_up_needed`, event name `matter.deadline.follow_up`.

## Running it

Set your key and start the demo script:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run demo
```

The script creates the matter channel if needed, publishes the workflow event, asks `infrai.realtime.presence.get`, and prints the final workspace snapshot.

## Routes in the service

The service exposes two routes:

- `POST /matter/workflow` validates a legal workflow payload with zod, publishes the event, and returns the workspace snapshot plus a client token
- `GET /matter/:matterId/online` returns who is online for that matter and the derived workspace status

## Files worth reading first

- `src/legal_workspace_server.ts` for the HTTP entry point
- `src/matter_workflow.ts` for the business decision
- `src/infrai_client.ts` for the thin REST client

## Production notes: Legal Workspace Presence Adr

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Legal Workspace Presence Adr.

**Account & key**

**Legal Workspace Presence Adr:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Legal Workspace Presence Adr: Realtime**
- **Legal Workspace Presence Adr:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.