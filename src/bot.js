'use strict';

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ThreadAutoArchiveDuration,
  Events,
} = require('discord.js');

const config = require('./config');
const { ProcessManager } = require('./managers/ProcessManager');

const SESSIONS = new Map();

function log(level, message) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[config.general.logLevel] ?? 1;
  const msgLevel = levels[level] ?? 1;
  
  if (msgLevel >= currentLevel) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

async function createSession(thread, userId, workingDir) {
  const sessionId = `${thread.id}`;
  
  const processManager = new ProcessManager({
    cliPath: config.omo.cliPath,
    workingDir: workingDir || config.omo.workingDir,
    envVars: parseEnvVars(config.omo.envVars),
    bufferCharLimit: config.buffer.charLimit,
    bufferFlushIntervalMs: config.buffer.flushIntervalMs,
  });

  processManager.onOutput = async (chunk) => {
    try {
      await thread.send(chunk);
    } catch (err) {
      log('error', `Failed to send message to thread ${thread.id}: ${err.message}`);
    }
  };

  processManager.onExit = async (code) => {
    try {
      await thread.send(`Process exited with code ${code}.`);
      SESSIONS.delete(sessionId);
    } catch (err) {
      log('error', `Failed to send exit message: ${err.message}`);
    }
  };

  processManager.onError = async (err) => {
    try {
      await thread.send(`Error: ${err.message}`);
    } catch (sendErr) {
      log('error', `Failed to send error message: ${sendErr.message}`);
    }
  };

  SESSIONS.set(sessionId, {
    threadId: thread.id,
    userId,
    processManager,
    createdAt: Date.now(),
  });

  return processManager;
}

function parseEnvVars(envString) {
  if (!envString) return {};
  
  const vars = {};
  const pairs = envString.split(',');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      vars[key.trim()] = value.trim();
    }
  }
  
  return vars;
}

function getSessionByThread(threadId) {
  return SESSIONS.get(threadId);
}

function getSessionCountForUser(userId) {
  let count = 0;
  for (const session of SESSIONS.values()) {
    if (session.userId === userId) {
      count++;
    }
  }
  return count;
}

async function handleStartCommand(message, args) {
  const userId = message.author.id;
  const userSessionCount = getSessionCountForUser(userId);
  
  if (userSessionCount >= config.thread.maxSessionsPerUser) {
    return message.reply(
      `You have reached the maximum of ${config.thread.maxSessionsPerUser} concurrent sessions.`
    );
  }

  const workingDir = args[0] || config.omo.workingDir;
  const threadName = `session-${userId.slice(-6)}-${Date.now().toString(36)}`;

  try {
    const thread = await message.channel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      type: ChannelType.PrivateThread,
      reason: `OpenCode session for ${message.author.username}`,
    });

    await thread.members.add(userId);

    const processManager = await createSession(thread, userId, workingDir);
    await processManager.spawn();

    await thread.send(
      `Session started. Working directory: \`${workingDir}\`\n` +
      `Type your commands below. Use \`!stop\` to end the session.`
    );

    log('info', `Created session ${thread.id} for user ${userId}`);
  } catch (err) {
    log('error', `Failed to create session: ${err.message}`);
    message.reply(`Failed to create session: ${err.message}`);
  }
}

async function handleStopCommand(message) {
  const session = getSessionByThread(message.channel.id);
  
  if (!session) {
    return message.reply('No active session in this thread.');
  }

  if (session.userId !== message.author.id) {
    return message.reply('You do not own this session.');
  }

  try {
    await message.channel.send('Stopping session...');
    await session.processManager.kill();
    SESSIONS.delete(message.channel.id);
  } catch (err) {
    log('error', `Failed to stop session: ${err.message}`);
    message.reply(`Failed to stop session: ${err.message}`);
  }
}

async function handleCommandInThread(message) {
  const session = getSessionByThread(message.channel.id);
  
  if (!session) {
    return;
  }

  if (session.userId !== message.author.id) {
    return;
  }

  const content = message.content;

  if (content === '!stop') {
    return handleStopCommand(message);
  }

  if (content.startsWith('!')) {
    return;
  }

  try {
    session.processManager.sendInput(content);
  } catch (err) {
    log('error', `Failed to send input: ${err.message}`);
    message.reply(`Error: ${err.message}`);
  }
}

async function main() {
  try {
    config.validate();
  } catch (err) {
    console.error('Configuration error:', err.message);
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, () => {
    log('info', `Bot logged in as ${client.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.channel.id === config.discord.channelId) {
      if (message.content.startsWith('!start')) {
        const args = message.content.slice(6).trim().split(/\s+/);
        await handleStartCommand(message, args);
      }
      return;
    }

    if (message.channel.isThread()) {
      await handleCommandInThread(message);
    }
  });

  client.on(Events.ThreadDelete, (thread) => {
    const session = SESSIONS.get(thread.id);
    if (session) {
      session.processManager.kill();
      SESSIONS.delete(thread.id);
      log('info', `Cleaned up session ${thread.id} due to thread deletion`);
    }
  });

  process.on('SIGINT', async () => {
    log('info', 'Shutting down...');
    
    for (const [sessionId, session] of SESSIONS) {
      try {
        await session.processManager.kill('SIGTERM', 3000);
      } catch (err) {
        log('error', `Error killing session ${sessionId}: ${err.message}`);
      }
    }
    
    await client.destroy();
    process.exit(0);
  });

  await client.login(config.discord.token);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
