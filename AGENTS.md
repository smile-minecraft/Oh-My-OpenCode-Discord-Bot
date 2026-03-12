# Project Hermes - AGENTS.md

**Generated:** 2025-03-13
**Project:** Discord-to-OhMyOpenCode bridge bot
**Stack:** Node.js 20+, discord.js v14

---

## Overview

Middleware bot that creates isolated development sessions via Discord private threads. Each thread spawns a dedicated Oh My OpenCode CLI process with bidirectional I/O.

Core constraint: **Zero third-party process management libraries** - uses native `child_process` only.

---

## Structure

```
src/
├── bot.js                 # Entry: Discord client, routing, session registry
├── config/index.js        # Environment loader with validation
├── managers/
│   └── ProcessManager.js  # CLI lifecycle: spawn, kill, stdio handling
├── interceptors/
│   └── StreamSanitizer.js # Output buffering + ANSI stripping
└── utils/
    ├── ansiRegex.js       # ANSI escape sequence patterns
    └── bufferFormatter.js # Discord message chunking/formatting
```

---

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Discord event handling | `src/bot.js` | MessageCreate, ThreadDelete listeners |
| Session registry | `src/bot.js:14` | Global `SESSIONS` Map (threadId -> session) |
| Process spawn/kill | `src/managers/ProcessManager.js` | SIGTERM → SIGKILL timeout pattern |
| Output throttling | `src/interceptors/StreamSanitizer.js` | 1900 char OR 500ms flush |
| ANSI stripping | `src/utils/ansiRegex.js:9` | Unicode regex `[\u001b\u009b]...` |
| Config validation | `src/config/index.js:101` | Throws on missing required env vars |

---

## Code Map

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `ProcessManager` | Class | `managers/ProcessManager.js` | CLI process wrapper |
| `StreamSanitizer` | Class | `interceptors/StreamSanitizer.js` | Output buffering |
| `SESSIONS` | Map | `bot.js:14` | In-memory session registry |
| `stripAnsi` | Function | `utils/ansiRegex.js:24` | ANSI code removal |
| `chunkContent` | Function | `utils/bufferFormatter.js:31` | Discord-safe splitting |

---

## Conventions

**Architecture:**
- Event-driven: ProcessManager uses callbacks (`onOutput`, `onExit`, `onError`)
- Session isolation: One `PrivateThread` + one `ProcessManager` per user session
- No persistence: Sessions lost on bot restart (acceptable by design)

**Code Style:**
- `'use strict';` in all files
- CommonJS modules (`require`/`module.exports`)
- Callback properties over EventEmitter for ProcessManager (simpler)
- StreamSanitizer extends EventEmitter (needs multiple output events)

**Environment:**
- Required: `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_CHANNEL_ID`
- Optional have sensible defaults in `src/config/index.js`
- CLI path default: `/usr/local/bin/omo`

**Process Management:**
- Always spawn with `stdio: ['pipe', 'pipe', 'pipe']`
- Force disable colors: `FORCE_COLOR=0`, `NO_COLOR=1`, `TERM=dumb`
- Graceful shutdown: SIGTERM (5s timeout) → SIGKILL
- Always `windowsHide: true` for cross-platform

---

## Anti-Patterns

**Forbidden:**
- Never use `pm2`, `forever`, or other process managers
- Never persist sessions to disk (in-memory only)
- Never use `stdio: 'inherit'` (breaks sanitization)

**Avoid:**
- Don't increase buffer limit beyond 1900 (Discord hard limit is 2000)
- Don't decrease flush interval below 100ms (rate limit risk)

---

## Commands

```bash
# Install
npm install

# Development (auto-reload on Node 20+)
npm run dev

# Production
npm start

# Linting
npm run lint
```

---

## Notes

**Session Lifecycle:**
1. User types `!start [dir]` in configured channel
2. Bot creates `PrivateThread`, spawns CLI process
3. All thread messages forwarded to CLI stdin
4. CLI stdout/stderr sanitized → Discord messages
5. `!stop` or thread deletion kills process

**Buffering Strategy:**
- Accumulate output in `StreamSanitizer.buffer`
- Flush triggers: size >= 1900 chars OR 500ms elapsed
- Output wrapped in ` ```bash\n...\n``` ` code blocks

**Security:**
- One session per thread (threadId is session key)
- Session ownership verified via `message.author.id`
- Max 3 concurrent sessions per user (configurable)

**Error Handling:**
- Config validation throws on startup (fatal)
- Process spawn errors sent to thread as message
- Unhandled errors logged but don't crash bot

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `discord.js` | Discord API client |
| `dotenv` | Environment file loading |

**Zero production dependencies for:**
- Process management (native `child_process`)
- ANSI stripping (native regex)
- Output buffering (native `setInterval`)
