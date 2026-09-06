import http from 'node:http';
import fs from 'node:fs';

export class BrowserDriver {
  constructor(port = 9222) {
    this.port = port;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async getPages() {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${this.port}/json`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  async connect() {
    const pages = await this.getPages();
    let target = pages.find(p => p.type === 'page');
    if (!target) {
      target = await new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${this.port}/json/new`, { method: 'PUT' }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
      });
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(target.webSocketDebuggerUrl);
      this.ws.onopen = async () => {
        await this.send('Page.enable');
        await this.send('DOM.enable');
        await this.send('Runtime.enable');
        await this.send('Network.enable');
        await this.send('Page.addScriptToEvaluateOnNewDocument', {
          source: `
            window.__mop_captured = window.__mop_captured || [];
            const origFetch = window.fetch;
            window.fetch = async function(...args) {
              const res = await origFetch.apply(this, args);
              try {
                const clone = res.clone();
                const data = await clone.json();
                window.__mop_captured.push({ url: args[0], data, time: Date.now() });
              } catch(e) {}
              return res;
            };
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
              this.__url = url;
              return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function() {
              this.addEventListener('load', () => {
                try {
                  const data = JSON.parse(this.responseText);
                  window.__mop_captured.push({ url: this.__url, data, time: Date.now() });
                } catch(e) {}
              });
              return origSend.apply(this, arguments);
            };
          `
        });
        resolve();
      };
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (this.eventHandler) {
          try { this.eventHandler(msg); } catch(e) {}
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url, waitMs = 2500) {
    await this.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs));
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('Eval Exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async click(selector) {
    const found = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView();
      el.click();
      return true;
    })()`);
    if (!found) throw new Error('Element not found to click: ' + selector);
    await new Promise(r => setTimeout(r, 600));
  }

  async clickText(text, tag = '*') {
    const found = await this.eval(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
      const match = els.find(el => el.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!match) return false;
      match.scrollIntoView();
      match.click();
      return true;
    })()`);
    if (!found) throw new Error('Element with text not found to click: ' + text);
    await new Promise(r => setTimeout(r, 600));
  }

  async fill(selector, value) {
    const found = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return true;
    })()`);
    if (!found) throw new Error('Element not found to fill: ' + selector);
    await new Promise(r => setTimeout(r, 300));
  }

  async select(selector, value) {
    const found = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!found) throw new Error('Select element not found: ' + selector);
    await new Promise(r => setTimeout(r, 300));
  }

  async getUrl() {
    return this.eval('window.location.href');
  }

  async getBodyText() {
    return this.eval('document.body.innerText');
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  async clearCookies() {
    await this.send('Network.clearBrowserCookies');
    await this.send('Network.clearBrowserCache');
    await this.eval(`localStorage.clear(); sessionStorage.clear();`);
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
