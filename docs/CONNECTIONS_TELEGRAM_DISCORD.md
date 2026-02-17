# Connections: Telegram & Discord

Optional in/out links so your home base can receive from and send to Telegram (and later Discord). **LOOM stays the center**; these are connectors, not the primary UI.

---

## Telegram (implemented)

### What works now

- **Receive:** DMs to your bot (text, images, voice, audio, documents) appear in the LOOM terminal feed. The first chat that messages the bot is saved as the default chat for replies.
- **Send:** Post from LOOM to Telegram via the **Telegram** circuit cell or `POST /api/connectors/telegram/send`.
- **In Telegram, you can:**
  - Send any message → AI chat (orchestrator picks model). You see “Thinking…” then “{Model} thinking…” then the reply.
  - `/help` — List all Telegram commands.
  - `/circuits` — List all saved circuits and templates (split into multiple messages if long).
  - `/<name>` or `/run <name>` — Run a circuit (e.g. `/steelman`, `/run dailybriefing`). Optional input: `/steelman Your claim here`. Circuits that need more than one input prompt you to run them in LOOM.
  - `/quick <question>` — Answer via the quick cloud lane (free/cheap models).
  - `/dream <prompt>` or `/imagine <prompt>` — Generate an image (Flux) and send the photo.
  - `/status` — Check that LOOM is connected (replies with backend/Telegram status).
  - Send a photo — Vision analysis; bot replies with “I see: …”.

One **conversation store** per Telegram chat: history is kept so the AI has context. Replies are **idempotent** (one reply per message/update).

**Requirement:** For full command support (AI chat, circuits, `/circuits`, etc.), the **LOOM tab must be open** in your browser; the backend relays inbound messages to the frontend over Socket.IO.

---

### Setup (Telegram)

1. **Get a bot token**
   - Open [@BotFather](https://t.me/BotFather) in Telegram → send `/newbot` → follow prompts → copy the token.

2. **Connect in LOOM**
   - Open LOOM → **Settings** → **Connections**.
   - Paste the token in the Telegram field and click **Connect**.
   - Status should show “Connected as @YourBot”.

3. **Set default chat**
   - Send any message to your bot from the Telegram account/chat you want to use. That chat becomes the default for all replies and circuit sends.

4. **Use from Telegram**
   - Send text for AI chat, or use `/help` to see commands. Keep the LOOM tab open for full support.

Config is stored on the backend (e.g. `backend/data/connectors.json`). Tokens are not sent to the frontend.

---

### API (Telegram)

| Method / Endpoint | Description |
|-------------------|-------------|
| `GET /api/connectors/status` | Status for all connectors (e.g. `telegram.connected`, `telegram.username`). |
| `POST /api/connectors/telegram/connect` | Connect Telegram (body: `{ "token": "...", "username"?: "..." }`). |
| `POST /api/connectors/telegram/disconnect` | Disconnect Telegram. |
| `POST /api/connectors/telegram/send` | Send a text message (`chat_id`, `message`; optional `in_reply_to_message_id`, `in_reply_to_update_id` for idempotency). |
| `POST /api/connectors/telegram/send-status` | Send a status message (e.g. “Thinking…”); returns `message_id` for later edit. |
| `POST /api/connectors/telegram/edit-message` | Edit a sent message (`chat_id`, `message_id`, `text`). |
| `POST /api/connectors/telegram/send-photo` | Send a photo (`chat_id`, `image_base64`, optional `caption`, `in_reply_to_*`). |
| `GET /api/connectors/telegram/conversation?chat_id=...` | Get conversation history for a chat. |

---

### Troubleshooting (Telegram)

- **Bot doesn’t reply**  
  Ensure the LOOM **browser tab is open** and backend + frontend are running. Inbound messages are delivered to the frontend via Socket.IO; if the tab is closed, only backend-only behavior runs (no AI chat or circuit runs).

- **“Not connected” on `/status`**  
  In LOOM: Settings → Connections → paste token → Connect. Then send one message to the bot to set the default chat.

- **Duplicate replies**  
  The backend uses idempotency (one reply per `(chat_id, message_id)` or `(chat_id, update_id)`). If you still see duplicates, ensure you’re on the latest version.

- **Circuits not found / list empty**  
  `/circuits` merges saved circuits (from backend) with built-in templates (from the frontend). With the tab open, you get the full list. Saved circuits are stored in the backend (e.g. SQLite); create and save circuits in the Circuit Board in LOOM.

---

## Discord (planned)

- **Receive:** DMs to the bot or messages in a chosen “inbox” channel → appear in the LOOM feed.
- **Send:** Post from LOOM to a Discord channel or DM.

Discord is not yet implemented. The same pattern as Telegram (token in Settings → Connections, backend connector, send/receive API) is intended.

---

## Quick links

| Goal | Link |
|------|------|
| **Telegram bot token** | [@BotFather](https://t.me/BotFather) → `/newbot` → copy token |
| **Telegram Bot API** | [core.telegram.org/bots/api](https://core.telegram.org/bots/api) |
| **Discord bot token** | [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot → Reset Token |
| **Discord developer docs** | [Discord developer docs](https://discord.com/developers/docs/getting-started) |

---

## Security

- Tokens are stored only on the backend (e.g. `backend/data/connectors.json`), never in the frontend or localStorage.
- For production, prefer env vars (e.g. `LOOM_TELEGRAM_BOT_TOKEN`) with fallback to the config file.
- Optional future: allowlist of `chat_id` or `user_id` so only selected users can use the bot.

---

## Architecture (Telegram)

- **Backend:** `connector_service` loads/saves config; Telegram listener (long-poll or webhook) receives updates and emits `telegram_inbound` over Socket.IO. Send/edit/send-photo call the Telegram Bot API.
- **Frontend:** Listens for `telegram_inbound`; handles commands (`/help`, `/circuits`, `/run`/`/<name>`, `/quick`, `/dream`/`/imagine`, `/status`, photos) and normal chat (orchestrator + AI). Conversation store is per `chat_id` (backend). Left sidebar can show “Chat with @BotName” and recent conversation.
