/**
 * Configuration Module
 * 
 * Centralized configuration management with environment variable support.
 */

'use strict';

require('dotenv').config();

/**
 * Parse environment variable with default value
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not set
 * @returns {*} Parsed value
 */
function env(key, defaultValue) {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    return defaultValue;
  }
  
  return value;
}

/**
 * Parse integer environment variable
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value
 * @returns {number} Parsed integer
 */
function envInt(key, defaultValue) {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    return defaultValue;
  }
  
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean environment variable
 * @param {string} key - Environment variable name
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
function envBool(key, defaultValue) {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    return defaultValue;
  }
  
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Configuration object
 */
const config = {
  // Discord configuration
  discord: {
    token: env('DISCORD_TOKEN'),
    applicationId: env('DISCORD_APPLICATION_ID'),
    guildId: env('DISCORD_GUILD_ID'),
    channelId: env('DISCORD_CHANNEL_ID'),
  },
  
  // Oh My OpenCode CLI configuration
  omo: {
    cliPath: env('OMO_CLI_PATH', '/usr/local/bin/omo'),
    workingDir: env('OMO_WORKING_DIR', process.cwd()),
    envVars: env('OMO_ENV_VARS', ''),
    projectPaths: env('PROJECT_PATHS_JSON') 
      ? JSON.parse(env('PROJECT_PATHS_JSON')) 
      : env('PROJECT_PATHS', '').split(',').filter(p => p.trim()),
    approveText: env('APPROVE_TEXT', 'y'),
    rejectText: env('REJECT_TEXT', 'n'),
  },
  
  embed: {
    updateIntervalMs: envInt('EMBED_UPDATE_INTERVAL_MS', 2000),
    maxDescLength: envInt('MAX_EMBED_DESC_LENGTH', 3800),
    minEditIntervalMs: envInt('MIN_EDIT_INTERVAL_MS', 1000),
  },
  
  // Buffer and streaming configuration
  buffer: {
    charLimit: envInt('BUFFER_CHAR_LIMIT', 1900),
    flushIntervalMs: envInt('BUFFER_FLUSH_INTERVAL_MS', 500),
  },
  
  // Thread management configuration
  thread: {
    autoArchiveDuration: envInt('THREAD_AUTO_ARCHIVE_DURATION', 1440),
    maxSessionsPerUser: envInt('MAX_SESSIONS_PER_USER', 3),
  },

  // Port configuration for opencode serve
  port: {
    startPort: envInt('PORT_START', 4096),
    endPort: envInt('PORT_END', 5096),
  },

  // General configuration
  general: {
    logLevel: env('LOG_LEVEL', 'info'),
  },
};

/**
 * Validate required configuration
 * @throws {Error} If required configuration is missing
 */
function validate() {
  const required = [
    ['discord.token', config.discord.token],
    ['discord.applicationId', config.discord.applicationId],
    ['discord.channelId', config.discord.channelId],
  ];
  
  const missing = required
    .filter(([_, value]) => !value)
    .map(([name]) => name);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}\n` +
      'Please check your .env file and ensure all required variables are set.'
    );
  }
}

module.exports = {
  ...config,
  validate,
  env,
  envInt,
  envBool,
};
