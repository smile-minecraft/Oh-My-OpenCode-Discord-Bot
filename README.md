# Project Hermes

Discord-to-OhMyOpenCode bridge bot - A middleware for isolated development session management via Discord threads.

## Overview

Project Hermes serves as a communication bridge between Discord and Oh My OpenCode CLI environments. It creates isolated development sessions using Discord's thread functionality, ensuring complete memory context separation across multiple concurrent projects.

## Features

- **Thread-Based Session Isolation**: Each development session runs in a dedicated Discord private thread
- **Native Process Management**: Direct Node.js `child_process` integration without third-party plugins
- **ANSI Code Sanitization**: Comprehensive regex-based filtering of terminal control sequences
- **Intelligent Output Buffering**: Character-limited (1900 chars) and time-based (500ms) flushing to Discord
- **Session Lifecycle Management**: Automatic cleanup on thread deletion or bot shutdown

## Project Structure

```
project-hermes/
├── src/
│   ├── bot.js                      # Main Discord bot entry point
│   ├── managers/
│   │   └── ProcessManager.js       # CLI process lifecycle management
│   ├── interceptors/
│   │   └── StreamSanitizer.js     # ANSI stripping + buffer throttling
│   ├── utils/
│   │   ├── ansiRegex.js           # ANSI escape sequence patterns
│   │   └── bufferFormatter.js     # Discord message formatting utilities
│   └── config/
│       └── index.js               # Environment configuration loader
├── .env.example                    # Configuration template
├── package.json                    # Dependencies and scripts
└── README.md                       # This file
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Discord bot token and configuration
```

### 3. Start the Bot

```bash
npm start
# or for development with auto-reload
npm run dev
```

## Usage

### Creating a Session

In the configured channel, type:
```
!start [working-directory]
```

The bot will create a private thread for your session and spawn an Oh My OpenCode CLI process.

### Interacting with Sessions

Once in a thread:
- Type commands directly - they will be sent to the CLI process
- Type `!stop` to terminate the session

### Session Limits

- Maximum 3 concurrent sessions per user (configurable)
- Sessions auto-archive after 24 hours of inactivity
- All output is sanitized and wrapped in Markdown code blocks

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | Required |
| `DISCORD_APPLICATION_ID` | Discord application ID | Required |
| `DISCORD_CHANNEL_ID` | Channel to listen for commands | Required |
| `OMO_CLI_PATH` | Path to Oh My OpenCode CLI | `/usr/local/bin/omo` |
| `BUFFER_CHAR_LIMIT` | Max chars before Discord flush | `1900` |
| `BUFFER_FLUSH_INTERVAL_MS` | Flush interval in milliseconds | `500` |
| `MAX_SESSIONS_PER_USER` | Concurrent session limit | `3` |

## Architecture

### Core Components

1. **Bot (`bot.js`)**: Discord client, message routing, session registry
2. **ProcessManager**: Spawns CLI processes, manages stdio, handles lifecycle
3. **StreamSanitizer**: Accumulates output, strips ANSI, throttles to Discord
4. **Utils**: ANSI regex patterns, Discord message formatting

### Data Flow

```
Discord Thread ← StreamSanitizer ← ProcessManager ← CLI Process
      ↓
Discord Thread → ProcessManager.stdin → CLI Process
```

## License

MIT
