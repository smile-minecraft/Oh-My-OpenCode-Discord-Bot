'use strict';

const { spawn } = require('child_process');

class ProcessManager {
  constructor(options = {}) {
    this.cliPath = options.cliPath || 'opencode';
    this.workingDir = options.workingDir || process.cwd();
    this.port = options.port || 4096;
    this.process = null;
    this.isRunning = false;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
  }

  async spawn() {
    if (this.isRunning) {
      throw new Error('Server already running.');
    }

    this.process = spawn(this.cliPath, ['serve', '--port', this.port.toString()], {
      cwd: this.workingDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.isRunning = true;

    await this.waitForServer();

    this.process.on('close', (code) => {
      this.isRunning = false;
      if (this.onExit) this.onExit(code);
    });

    this.process.on('error', (err) => {
      this.isRunning = false;
      if (this.onError) this.onError(err);
    });

    return { pid: this.process.pid };
  }

  async waitForServer(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/global/health`);
        if (response.ok) {
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Server failed to start within timeout');
  }

  async createSession(title) {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return await response.json();
  }

  async sendMessage(sessionId, text) {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    return true;
  }

  async getMessages(sessionId) {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/message`);

    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }

    return await response.json();
  }

  async deleteSession(sessionId) {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}`, {
      method: 'DELETE',
    });

    return response.ok;
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
      const timer = setTimeout(() => {
        if (!this.process.killed) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, timeoutMs);

      this.process.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.cleanup();
  }

  cleanup() {
    this.process = null;
    this.isRunning = false;
  }

  sendInput(input) {
    throw new Error('sendInput is not supported in serve mode. Use sendMessage() instead.');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      pid: this.process?.pid || null,
      port: this.port,
      baseUrl: this.baseUrl,
    };
  }
}

module.exports = { ProcessManager };
