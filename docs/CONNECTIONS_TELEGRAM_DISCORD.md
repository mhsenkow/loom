# Connections: Telegram & Discord (home-base in/out)

Optional in/out links so your home base can receive from or send to Telegram and Discord. **LOOM stays the center**; these are connectors, not the primary UI.

---

## Quick links (get to “ready to connect” fast)

| Goal | Link |
|------|------|
| **Telegram bot token** | [Open @BotFather in Telegram](https://t.me/BotFather) → send `/newbot` → name/username → copy token |
| **Telegram Bot API reference** | [core.telegram.org/bots](https://core.telegram.org/bots) and [Bot API](https://core.telegram.org/bots/api) |
| **Discord bot token** | [Discord Developer Portal → Applications](https://discord.com/developers/applications) → New Application → Bot → Add Bot → Reset Token |
| **Discord developer docs** | [Discord developer docs](https://discord.com/developers/docs/getting-started) |

---

## What each connection can do

- **Telegram**
  - **Receive:** DMs to your bot (text, images, voice, audio, documents) appear in the LOOM terminal feed. Connect your bot in Settings → Connections; the listener starts automatically. The first chat that messages the bot is saved as `default_chat_id` so you can send replies from circuits.
  - **Send:** Post from LOOM to Telegram via the **Telegram** circuit cell or API. Uses the saved default chat (set automatically when someone first messages the bot).

- **Discord**
  - **Receive:** DMs to the bot, or messages in a chosen “inbox” channel → appear in the LOOM feed.
  - **Send:** Post from LOOM to a Discord channel or DM.

---

## Effort (rough)

| Piece | Difficulty | Time (order of magnitude) |
|-------|------------|----------------------------|
| **Backend: Telegram bot (in + out)** | Medium | 1–2 days |
| **Backend: Discord bot (in + out)** | Medium | 1–2 days |
| **Easy Settings UI** (tokens, connect, status) | Easy | Half day |
| **Storing tokens securely** | Easy | Reuse pattern from cloud providers (env or backend JSON, not in frontend) |
| **Deciding behavior** | Product | e.g. “All DMs to feed” vs “Only when @mentioned” |

**Total for both + settings:** about **3–5 days** for a focused dev, assuming you’re okay with “all DMs → feed” and “post to channel” as first version.

---

## How hard, in practice

- **Telegram:** Bot API is simple. Create bot with [@BotFather](https://t.me/BotFather), get token. Use [python-telegram-bot](https://github.com/python-telegram-bot/python-telegram-bot) (or [Telethon](https://github.com/LonamiWebs/Telethon) for user bots). Webhook or long-polling. Inbound: “message → append to LOOM feed or a queue”; outbound: “send message to chat_id.”
- **Discord:** Create app in [Discord Developer Portal](https://discord.com/developers/applications), bot token. Use [discord.py](https://github.com/Rapptz/discord.py). Inbound: “message in channel/DM → forward to LOOM”; outbound: “post to channel/DM.” Slightly more setup (intents, permissions) but still straightforward.
- **Easy settings:** Same idea as Cloud Providers: a “Connections” section in Settings, one card per service (Telegram, Discord). Field for bot token, “Connect” saves to backend and starts the connector (or webhook registration). Show status: “Connected as @YourBot” / “Disconnected.”

So: **not very hard** if you’re fine with a simple first version (one bot per service, one “inbox” and one “outbox” per connection).

---

## Minimal architecture

1. **Backend**
   - **Config:** Store connection config (e.g. `backend/data/connectors.json` or DB table): `telegram_token`, `discord_token`, optional `telegram_chat_id`, `discord_channel_id` for default outbound.
   - **Connectors:** Two small modules (or one package):
     - `app/services/connectors/telegram_connector.py` — start bot (long-poll or set webhook), on message → push to a queue or HTTP callback that appends to “inbound” feed; expose “send_message(chat_id, text).”
     - `app/services/connectors/discord_connector.py` — same idea: on_message → inbound; send to channel/DM for outbound.
   - **API:** e.g. `GET/POST /api/connectors/status`, `POST /api/connectors/telegram` (body: `{ "token": "..." }`), `POST /api/connectors/discord`, and optionally `POST /api/connectors/telegram/send`, `POST /api/connectors/discord/send` for “post from LOOM.”

2. **Frontend**
   - **Settings → Connections:** Section “Connections” with:
     - **Telegram:** Token input, “Connect” / “Disconnect,” status line (“Connected as @… ” or “Not connected”).
     - **Discord:** Same pattern.
   - Optional: in terminal or circuit, “Send to Telegram” / “Send to Discord” (or slash commands `/telegram ...`, `/discord ...`).

3. **Inbound behavior (first version)**
   - **Telegram:** All direct messages to the bot → append as a system or user entry in the feed (e.g. “From Telegram: @user: message”).
   - **Discord:** DMs to the bot (or messages in one “inbox” channel) → same idea.

4. **Outbound**
   - User chooses “Post to Telegram/Discord” (or runs a circuit that outputs to a connector). Backend uses stored default chat_id/channel_id or user picks from a list.

---

## Implementation order

1. **Settings UI** — Add “Connections” section with Telegram and Discord cards (token + Connect/Disconnect + status). Backend can return “not implemented yet” until step 2.
2. **Backend config + API** — Endpoints to save/clear tokens and read status; store in `connectors.json` or env.
3. **Telegram connector** — Bot process or background task; on message → callback to append to feed; send API for outbound.
4. **Discord connector** — Same.
5. **Feed integration** — Decide how “inbound” messages appear in the terminal feed (e.g. a new entry type “from_telegram” / “from_discord”) and optional “Send to…” in the UI.

---

## Dependencies

- **Telegram:** `pip install python-telegram-bot` (or `telethon`).
- **Discord:** `pip install discord.py`.

Add to `requirements.txt` (or optional extra `connectors`) when you implement.

---

## Security

- Store tokens only on the backend (never in frontend or localStorage).
- Prefer env vars for production (e.g. `LOOM_TELEGRAM_BOT_TOKEN`) with fallback to config file.
- If using webhooks, use a secret path or signature so only Telegram/Discord can call it.

---

## “Easy settings connection thing”

The “easy” part is: one Settings section, two cards (Telegram, Discord), token field + Connect/Disconnect. Backend does the rest (start/stop bot, store token, show status). Same UX pattern as Cloud Providers: paste token → Connect → “Connected.” No need for OAuth for bots (bot tokens are enough for Telegram and Discord).
