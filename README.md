# Sharedit

## Run on one server

From the Sharedit root, install the two packages' dependencies and start the app:

```sh
npm ci --prefix frontend
npm ci --prefix backend
npm start
```

`npm start` builds the frontend and starts Express. Open <http://localhost:3001/>. The page, live editor sync, and online users list all use that server. Shared text is kept in memory, not on disk.

## Workspace layout

The slim left rail shows each participant’s initials: green means online, red means offline. Expand the rail using its sidebar button or an avatar to see full names and status; the editor moves aside rather than being covered. Gray means connection status is unavailable. Disconnected participants remain in the current server session’s roster for up to 24 hours (at most 100 offline entries). The roster clears on a server restart. Names and presence IDs are not accounts or authentication.

The editor, side-by-side AI tutor, and dark terminal below the editor are separate rounded panels. On narrow screens, the tutor stacks below the terminal. Closing the tutor gives the editor more space and resets the private chat.

Use **A− / A+** in the editor header to change text size from **10–30 px**. Click the size value to reset it to **14 px**. The size and matching line spacing change immediately, are remembered in this browser, and do not affect collaborators, shared code, the terminal, or chat.

Named, colored cursors show where collaborators are working. Drag the divider above the terminal or to the left of the tutor to resize the panels. Focus a divider and use the arrow keys, or double-click it to reset. Custom sizes are stored in this browser. The tutor width handle is hidden in the stacked layout. Use **Download** to save the current source with the selected language’s extension.

## Run editor code

Pick **Python**, **C++**, **JavaScript**, or **TypeScript** in the editor’s **top-right language picker**, then click **Run code** in the terminal. The language is remembered in this browser’s local storage and restored on reload; blocked/invalid storage falls back to TypeScript. The picker also changes Monaco highlighting in your tab without changing shared text or another user’s language. It is disabled during a run, and changing it clears stale output. Examples: `print(2 + 3)` in Python or `console.log(2 + 3)` in JavaScript. C++ uses Clang in C++20 mode.

Use **⌘+Enter** or **Ctrl+Enter** from the editor or terminal to run. The summary reports browser-side elapsed time (including startup/compilation) and the number of captured output lines. When the runner reports a source location, click **Jump to line** to highlight it. If the source has changed, rerun it before jumping. Turn on **Predict** before a run to guess the output before seeing it. Errors are shown immediately; successful output is revealed when you check your prediction or choose **Reveal output**.

Runs take place in browser workers, with time and output limits. Python and C++ have their standard libraries, but no host filesystem or network access. The terminal is output-only: it isn't a shell and doesn't provide interactive input. The first Python or C++ run may take longer because the browser has to load its runtime. The frontend build downloads and verifies a pinned CPython WASI archive and copies Clang's bundled assets, so no external execution service is needed.

## AI tutor (Groq)

If you ask for a fix with editor code attached and the tutor returns a complete replacement, **Review code changes** opens a side-by-side diff. **Apply to shared editor** is explicit, runs nothing, and refuses to apply if the source or language no longer matches the submitted snapshot.

Click **Ask AI tutor** above the editor and type a question in the chat. Press **Send** or Enter; Shift+Enter adds a newline. Ask for an explanation, a hint, or paste your exercise directly into a message. You can chat even with an empty editor. **Include editor code & matching run output** optionally attaches the current code and output only when it matches that code and language.

User/assistant messages appear as chat bubbles, with readable code blocks. Recent complete turns are included in follow-ups, bounded to fit the provider budget. Closing the tutor (including Hide AI tutor) and reopening it starts an empty chat. No conversation is stored in browser storage or on our server. **Only the conversation resets: token usage does not.** The daily allowance is pinned above the scrolling conversation, refreshed when opened, after replies, and every 15 seconds while open.

Feedback is private to your tab and never replaces the shared editor. The tutor is advisory, not a correctness proof: it does not execute code or run hidden tests. Keep using the browser runner and check expected results. Code/context is sent to Groq only on Send, not while typing. Do not include secrets. Each reply concerns the submitted snapshot, not later edits.

### Enable it

1. Create a key privately at <https://console.groq.com/keys>. Check the model and quota in your Groq console; free-tier access and limits can change.
2. Copy `.env.example` to `.env` in this directory and set `GROQ_API_KEY` there. Alternatively set it as a secret environment variable on your hosting service. Never use a `VITE_` variable for it. Do not put the key in a chat, screenshot, frontend bundle, or git.
3. Start/restart the backend. It reads the root `.env` automatically (Node 24+); existing deployment environment variables take precedence. `GROQ_MODEL` defaults to `openai/gpt-oss-20b`, with low reasoning effort and bounded output.

Without a key the editor and runner still work; the tutor explicitly shows “not configured”. Real Groq inference must be checked with your account before public launch; automated tests use a fake provider and no real tokens.

### Quotas and identity

- **100,000 tokens per browser visitor per day**, including the system instructions, exercise, code, question, selected output and completion (including billed reasoning). The meter resets at **00:00 UTC / 05:30 IST**, and displays the reset time in the browser's timezone.
- **180,000 tokens and 900 requests per app per day** by default. This is a safety ceiling, not a guarantee of provider capacity. All visitors share it. Two visitors cannot each spend 100,000 when the app has only 180,000. Set `AI_GLOBAL_DAILY_TOKENS` and `AI_GLOBAL_DAILY_REQUESTS` below the actual allowance for your key/model, accounting for any other apps using it.
- A signed, HttpOnly, SameSite cookie identifies a visitor across refreshes/name changes. Display names are NOT authentication. A secondary 100,000-token network/IP cap reduces cookie-reset abuse; users behind the same network share this cap. This is a small-launch guard, **not a secure per-person entitlement**. Public deployment needs access control at the proxy or real authenticated accounts; clearing cookies, changing networks and bot traffic remain abuse risks.
- One provider request at a time, a rolling 7,500-token/20-request minute guard, bounded inputs and 1,400 maximum completion tokens limit spikes. The backend reserves a conservative UTF-8 input bound plus maximum output **before** calling Groq, then reconciles the provider's actual `usage.total_tokens`. Large prompts or low remaining balances can be rejected even if a shorter answer would fit.
- Explicit provider rejections refund token reservations, but attempts still count against request limits. Ambiguous failures/timeouts/crashes retain the reservation so a retry cannot silently overspend. Groq 429 responses trigger a cooldown; there are no automatic paid retries.
- Usage, hashed network identifiers and the cookie signing secret persist in `backend/data/ai-usage.json`, never student prompts, code or replies. Don't delete this file to restart: that resets quotas and visitor signatures. Keep its permissions private and mount durable storage for it. Corrupt/unwritable storage fails closed. Run **one backend instance**: multiple processes sharing this JSON file are unsupported; use a transactional shared database before scaling horizontally.

Configuration: `AI_USER_DAILY_TOKENS`, `AI_GLOBAL_DAILY_TOKENS`, `AI_GLOBAL_DAILY_REQUESTS`, `AI_DATA_DIR`, `GROQ_MODEL`. Set `AI_PUBLIC_ORIGIN=https://your-app.example` (no trailing slash) for production. Only set `AI_TRUST_PROXY=1` if requests can come solely through a trusted proxy that **overwrites** forwarded IP/protocol headers; the backend must not be directly reachable. Otherwise the network guard can be spoofed. Origin checks stop cross-site browser requests but are not authentication.

Tests: `node --test backend/ai.test.js` from this directory. Covers persistence, daily reset, reservations, concurrency, identity tampering, provider errors, validation and server-only secret handling.

## Run with Docker

Build from the Sharedit root so Docker can see both packages:

```sh
docker build -t sharedit .
docker run --rm -p 127.0.0.1:8080:3001 \
  --env-file .env -v sharedit-ai-data:/app/backend/data sharedit
# Omit --env-file .env to run without the AI tutor.
```

Open <http://localhost:8080/>. The multi-stage build copies `frontend/dist` into the backend image at the path Express already serves. The final container runs only Express; it does not run Vite or need a `backend/public` folder. Port `8080` is the host port and can be changed without rebuilding the image.

Run one container for each shared session deployment: the document and online roster are in memory and aren't shared between replicas. Restarting the container clears the document. For a remote deployment, use an HTTPS reverse proxy that preserves the public `Host` and forwards WebSocket upgrades on `/socket.io/`. Display names are not authentication; use a private network or access control at the proxy before exposing the app publicly.

## Develop with hot reload

In separate terminals at the Sharedit root, run `node backend/server.js` and `npm --prefix frontend run dev`. Open <http://localhost:5173/>. Vite proxies Socket.IO and `/api/ai` to the backend. If the one-server app is already running, reuse that backend rather than starting another process on port 3001.