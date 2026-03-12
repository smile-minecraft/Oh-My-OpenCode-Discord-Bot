/**
 * Buffer Formatter Utilities
 * 
 * Helper functions for formatting and chunking output for Discord messages.
 */

'use strict';

/**
 * Default Discord message character limit
 * Discord limits messages to 2000 characters; we use 1900 to leave room for markdown
 */
const DEFAULT_CHAR_LIMIT = 1900;

/**
 * Wrap content in markdown code block
 * @param {string} content - Content to wrap
 * @param {string} language - Language identifier for syntax highlighting (default: 'bash')
 * @returns {string} Markdown code block
 */
function wrapInCodeBlock(content, language = 'bash') {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

/**
 * Split content into chunks that fit within Discord's message limit
 * @param {string} content - Content to chunk
 * @param {number} maxLength - Maximum length per chunk (default: 1900)
 * @returns {string[]} Array of content chunks
 */
function chunkContent(content, maxLength = DEFAULT_CHAR_LIMIT) {
  const chunks = [];
  let remaining = content;
  
  while (remaining.length > maxLength) {
    // Find the last newline before the limit to break cleanly
    let breakPoint = remaining.lastIndexOf('\n', maxLength);
    
    // If no newline found, or it's too early, force break at limit
    if (breakPoint < maxLength * 0.5) {
      breakPoint = maxLength;
    }
    
    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
    
    // Remove leading newlines from remaining
    remaining = remaining.replace(/^\n+/, '');
  }
  
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  
  return chunks;
}

/**
 * Format content for Discord with proper markdown escaping
 * @param {string} content - Raw content
 * @returns {string} Discord-safe content
 */
function escapeMarkdown(content) {
  if (typeof content !== 'string') {
    return content;
  }
  
  // Escape Discord markdown characters that aren't code block related
  return content
    .replace(/\\/g, '\\\\')     // Backslash
    .replace(/\*/g, '\\*')       // Asterisk
    .replace(/_/g, '\\_')        // Underscore
    .replace(/~/g, '\\~')        // Tilde
    .replace(/`/g, '\\`')        // Backtick (outside code blocks)
    .replace(/\|/g, '\\|')       // Pipe
    .replace(/</g, '\\<')        // Less than (prevents @mentions, #channels, etc.)
    .replace(/@everyone/g, '@\u200Beveryone')   // Zero-width space prevents ping
    .replace(/@here/g, '@\u200Bhere');           // Zero-width space prevents ping
}

/**
 * Truncate content with ellipsis if it exceeds max length
 * @param {string} content - Content to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add when truncated (default: '...')
 * @returns {string} Truncated content
 */
function truncate(content, maxLength = DEFAULT_CHAR_LIMIT, suffix = '...') {
  if (typeof content !== 'string') {
    return content;
  }
  
  if (content.length <= maxLength) {
    return content;
  }
  
  return content.slice(0, maxLength - suffix.length) + suffix;
}

module.exports = {
  DEFAULT_CHAR_LIMIT,
  wrapInCodeBlock,
  chunkContent,
  escapeMarkdown,
  truncate,
};
