'use strict';

const EventEmitter = require('events');
const { stripAnsi } = require('../utils/ansiRegex');
const { wrapInCodeBlock, chunkContent } = require('../utils/bufferFormatter');

/**
 * StreamSanitizer manages output buffering from child processes.
 * Accumulates stdout/stderr data, strips ANSI codes, and flushes
 * to Discord when buffer reaches size limit or time threshold.
 */
class StreamSanitizer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.charLimit = options.charLimit || 1900;
    this.flushIntervalMs = options.flushIntervalMs || 500;
    this.buffer = '';
    this.flushTimer = null;
    this.isActive = false;
  }

  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    this.flush();
  }

  write(data) {
    if (!this.isActive) return;
    
    const cleaned = stripAnsi(data.toString());
    this.buffer += cleaned;
    
    if (this.buffer.length >= this.charLimit) {
      this.flush();
    }
  }

  flush() {
    if (this.buffer.length === 0) return;
    
    const content = this.buffer;
    this.buffer = '';
    
    const chunks = chunkContent(content, this.charLimit);
    
    for (const chunk of chunks) {
      this.emit('output', wrapInCodeBlock(chunk));
    }
  }

  getPendingBuffer() {
    return this.buffer;
  }
}

module.exports = { StreamSanitizer };
