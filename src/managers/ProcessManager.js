'use strict';

const { spawn } = require('child_process');
const { StreamSanitizer } = require('./StreamSanitizer');

/**
 * ProcessManager handles the lifecycle of Oh My OpenCode CLI processes.
 * Spawns child processes, manages stdio streams, and coordinates
 * output sanitization for Discord message delivery.
 */
class ProcessManager {
  constructor(options = {}) {
    this.cliPath = options.cliPath || '/usr/local/bin/omo';
    this.workingDir = options.workingDir || process.cwd();
    this.envVars = options.envVars || {};
    this.sanitizerOptions = {
      charLimit: options.bufferCharLimit || 1900,
      flushIntervalMs: options.bufferFlushIntervalMs || 500,
    };
    
    this.process = null;
    this.sanitizer = null;
    this.isRunning = false;
  }

  async spawn(args = []) {
    if (this.isRunning) {
      throw new Error('Process already running. Kill it first before spawning a new one.');
    }

    this.sanitizer = new StreamSanitizer(this.sanitizerOptions);
    this.sanitizer.on('output', (chunk) => this.emitOutput(chunk));
    
    const env = {
      ...process.env,
      ...this.envVars,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      TERM: 'dumb',
    };

    this.process = spawn(this.cliPath, args, {
      cwd: this.workingDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.isRunning = true;
    this.sanitizer.start();

    this.process.stdout?.on('data', (data) => {
      this.sanitizer.write(data);
    });

    this.process.stderr?.on('data', (data) => {
      this.sanitizer.write(data);
    });

    this.process.on('close', (code) => {
      this.handleExit(code);
    });

    this.process.on('error', (err) => {
      this.handleError(err);
    });

    return {
      pid: this.process.pid,
      stdin: this.process.stdin,
    };
  }

  async kill(signal = 'SIGTERM', timeoutMs = 5000) {
    if (!this.process || !this.isRunning) {
      return;
    }

    if (this.process.killed) {
      this.cleanup();
      return;
    }

    this.process.kill(signal);

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!this.process.killed) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, timeoutMs);

      this.process.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.cleanup();
  }

  sendInput(input) {
    if (!this.isRunning || !this.process?.stdin) {
      throw new Error('Process not running. Cannot send input.');
    }

    this.process.stdin.write(input + '\n');
  }

  emitOutput(chunk) {
    if (this.onOutput) {
      this.onOutput(chunk);
    }
  }

  handleExit(code) {
    this.sanitizer?.stop();
    this.isRunning = false;
    
    if (this.onExit) {
      this.onExit(code);
    }
  }

  handleError(err) {
    this.sanitizer?.stop();
    this.isRunning = false;
    
    if (this.onError) {
      this.onError(err);
    }
  }

  cleanup() {
    this.sanitizer?.stop();
    this.sanitizer = null;
    this.process = null;
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      pid: this.process?.pid || null,
      pendingBuffer: this.sanitizer?.getPendingBuffer() || '',
    };
  }
}

module.exports = { ProcessManager };
