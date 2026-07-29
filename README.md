# n8n-nodes-iotpush

![n8n community node](https://img.shields.io/badge/n8n-community%20node-orange)
![npm](https://img.shields.io/npm/v/n8n-nodes-iotpush)
![license](https://img.shields.io/npm/l/n8n-nodes-iotpush)

This is an [n8n](https://n8n.io/) community node for [iotpush](https://www.iotpush.com) — a multi-channel IoT push notification service.

Send real-time push notifications to any device, webhook, or integration channel directly from your n8n workflows.

[iotpush](https://www.iotpush.com) · [Documentation](https://www.iotpush.com/docs) · [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)

## Installation

Follow the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

### In n8n Desktop / Self-hosted

1. Go to **Settings** → **Community Nodes**
2. Enter `n8n-nodes-iotpush`
3. Click **Install**

### Manual Installation

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-iotpush
```

Then restart n8n.

## Configuration

1. **Create an iotpush account** at [iotpush.com](https://www.iotpush.com)
2. **Create a topic** in the iotpush dashboard
3. **Copy your API key** from the topic settings (for private topics)
4. In n8n, add **IoTPush API** credentials with your API key
   - For **public topics**, credentials are optional

## Operations

### Message

| Operation | Description |
|-----------|-------------|
| **Send Push** | Send a push notification to a topic |
| **Get Messages** | Retrieve recent messages for a topic |

### Topic

| Operation | Description |
|-----------|-------------|
| **Get Info** | Get information about a topic |

## Usage Examples

### Send a Simple Notification

1. Add the **IoTPush** node to your workflow
2. Select **Message** → **Send Push**
3. Enter your **Topic** name
4. Enter a **Message** (e.g., "Server health check passed ✅")
5. Optionally set **Title**, **Priority**, and **Tags**

### Monitor & Alert Pipeline

Connect a **Cron** trigger → **HTTP Request** (check your service) → **IF** (check status) → **IoTPush** (send alert on failure).

### Send with Priority

```json
{
  "topic": "server-alerts",
  "message": "CPU usage above 90%!",
  "title": "🔥 High CPU Alert",
  "priority": "urgent",
  "tags": "server,cpu,alert"
}
```

## Screenshots

<!-- Add screenshots of the node in action -->
*Coming soon*

## Resources

- [iotpush Website](https://www.iotpush.com)
- [iotpush Documentation](https://www.iotpush.com/docs)
- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE) © DaSecure Solutions LLC

## Two-way notifications (new in 1.1.0)

iotpush notifications can carry **action buttons**. Combine the `IoTPush` node with the
`IoTPush Trigger` node to put a human in the middle of a workflow:

1. **IoTPush** → Send Push, with Action Buttons `approve` / `reject`
2. **IoTPush Trigger** → listening on the same topic for the `action` event
3. A **Switch** node on `{{ $json.actionId }}` branches the workflow

```
Deploy pipeline ──> IoTPush (Send: "Deploy v2.3 to prod?" [Approve][Reject])
                                            │
                          (user taps on their phone)
                                            │
                    IoTPush Trigger (event: action) ──> Switch on actionId
                                                          ├─ approve ─> deploy
                                                          └─ reject  ─> notify team
```

The trigger also fires on `delivered`, `read`, and `expired`, and exposes `replyText` when the
user sends a text reply instead of tapping a button.

### Trigger node requirements

The trigger registers its own webhook via `POST /api/webhooks` on workflow activation and removes
it on deactivation. This requires an API key with permission to manage webhooks for its topic.

## Nodes

| Node | Type | Purpose |
|---|---|---|
| **IoTPush** | Action | Send a push notification, or read recent messages for a topic |
| **IoTPush Trigger** | Trigger | Start a workflow when a user acts on a notification |

## Operations

### Message → Send Push
Sends to `POST /api/push/{topic}`. Supports title, priority (`low`/`normal`/`high`/`urgent`),
tags, click URL, callback URL, and action buttons.

### Message → Get Messages
Reads from `GET /api/push/{topic}?limit=N`. Returns the topic's recent message history.

> **Removed in 1.1.0:** `Topic → Get Info`. It called `GET /api/topic/{topic}`, a route that does
> not exist and always returned 404.
