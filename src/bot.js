'use strict';

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ThreadAutoArchiveDuration,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
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

async function createSession(thread, userId, workingDir, statusMessageId = null) {
  const sessionId = `${thread.id}`;

  const processManager = new ProcessManager({
    cliPath: config.omo.cliPath,
    workingDir: workingDir || config.omo.workingDir,
    envVars: parseEnvVars(config.omo.envVars),
    bufferCharLimit: config.buffer.charLimit,
    bufferFlushIntervalMs: config.buffer.flushIntervalMs,
  });

  processManager.onOutput = async (chunk) => {
    const session = SESSIONS.get(sessionId);
    if (!session || !session.statusMessageId) return;

    // Chain to editQueue for sequential processing
    session.editQueue = session.editQueue.then(async () => {
      try {
        const statusMsg = await thread.messages.fetch(session.statusMessageId);

        // Get rolling buffer content
        const content = processManager.sanitizer.getLastNChars(config.embed.maxDescLength);

        // Build updated embed
        const updatedEmbed = EmbedBuilder.from(statusMsg.embeds[0])
          .setDescription(`\`\`\`bash\n${content}\n\`\`\``)
          .setTimestamp();

        await statusMsg.edit({ embeds: [updatedEmbed] });

        // Rate limit protection delay
        await new Promise(r => setTimeout(r, config.embed.minEditIntervalMs));
      } catch (err) {
        log('error', `Failed to update embed: ${err.message}`);
      }
    });
  };

  processManager.onExit = async (code) => {
    const session = SESSIONS.get(sessionId);
    
    if (session && session.statusMessageId) {
      try {
        const statusMsg = await thread.messages.fetch(session.statusMessageId);
        const isSuccess = code === 0;
        
        const updatedEmbed = EmbedBuilder.from(statusMsg.embeds[0])
          .setTitle('CLI Session - Ended')
          .setColor(isSuccess ? 0x57F287 : 0xED4245)
          .spliceFields(1, 1, { name: 'Status', value: isSuccess ? '✅ Completed' : '❌ Error', inline: true });
        
        const disabledButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('btn_approve')
              .setLabel('✓ Approve')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('btn_reject')
              .setLabel('✗ Reject')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('btn_stop')
              .setLabel('⏹ Stop')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        
        await statusMsg.edit({ 
          embeds: [updatedEmbed], 
          components: [disabledButtons] 
        });
      } catch (err) {
        log('error', `Failed to update exit status: ${err.message}`);
      }
    }
    
    SESSIONS.delete(sessionId);
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
    statusMessageId,
    editQueue: Promise.resolve(),
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

async function handleProjectSelect(interaction) {
  const workingDir = interaction.values[0];
  const userId = interaction.user.id;
  const userSessionCount = getSessionCountForUser(userId);

  if (userSessionCount >= config.thread.maxSessionsPerUser) {
    return interaction.reply({
      content: `You have reached the maximum of ${config.thread.maxSessionsPerUser} concurrent sessions.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const threadName = `session-${userId.slice(-6)}-${Date.now().toString(36)}`;

  try {
    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      type: ChannelType.PrivateThread,
      reason: `OpenCode session for ${interaction.user.username}`,
    });

    await thread.members.add(userId);

    const statusEmbed = new EmbedBuilder()
      .setTitle('CLI Session')
      .setDescription('```\nInitializing...\n```')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Project', value: workingDir, inline: true },
        { name: 'Status', value: '🟢 Running', inline: true }
      )
      .setTimestamp();

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_approve')
          .setLabel('✓ Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_reject')
          .setLabel('✗ Reject')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('btn_stop')
          .setLabel('⏹ Stop')
          .setStyle(ButtonStyle.Secondary)
      );

    const statusMsg = await thread.send({
      embeds: [statusEmbed],
      components: [buttons]
    });

    const processManager = await createSession(thread, userId, workingDir, statusMsg.id);
    await processManager.spawn();

    await interaction.editReply(`Session started in ${thread}`);
    log('info', `Created session ${thread.id} for user ${userId}`);
  } catch (err) {
    log('error', `Failed to create session: ${err.message}`);
    await interaction.editReply(`Failed to create session: ${err.message}`);
  }
}

async function handleButtonInteraction(interaction) {
  const threadId = interaction.channel?.id;
  const session = SESSIONS.get(threadId);

  if (!session) {
    return interaction.reply({ content: 'No active session.', ephemeral: true });
  }

  if (session.userId !== interaction.user.id) {
    return interaction.reply({ content: 'Only session owner can interact.', ephemeral: true });
  }

  if (!session.processManager.isRunning) {
    return interaction.reply({ content: 'Session is not running.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  switch (interaction.customId) {
    case 'btn_approve':
      session.processManager.sendInput(config.omo.approveText);
      await interaction.deleteReply();
      break;
    case 'btn_reject':
      session.processManager.sendInput(config.omo.rejectText);
      await interaction.deleteReply();
      break;
    case 'btn_stop':
      await session.processManager.kill();
      await interaction.editReply('Session stopped.');
      break;
  }
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

  client.once(Events.ClientReady, async () => {
    log('info', `Bot logged in as ${client.user.tag}`);
    
    // Send project picker
    const channel = await client.channels.fetch(config.discord.channelId);
    
    // Check for existing picker (search last 10 messages)
    const messages = await channel.messages.fetch({ limit: 10 });
    const existingPicker = messages.find(m => 
      m.author.id === client.user.id && 
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Select Project')
    );
    
    if (!existingPicker) {
      const embed = new EmbedBuilder()
        .setTitle('Oh My OpenCode - Select Project')
        .setDescription('Choose a project to start a development session')
        .setColor(0x5865F2);
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_project')
        .setPlaceholder('Choose a project...')
        .addOptions(
          config.omo.projectPaths.map(path => ({
            label: path.split('/').pop() || path,
            description: path,
            value: path
          }))
        );
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await channel.send({ embeds: [embed], components: [row] });
    }
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

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_project') {
      await handleProjectSelect(interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
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
