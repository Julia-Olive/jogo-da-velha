/**
 * Executor de testes de interface (sem dependências — Node 22+).
 *
 *   node tests/run-browser-tests.js            → roda CT01–CT10 + extras no Chrome/Edge headless
 *   node tests/run-browser-tests.js --serve    → só sobe o servidor para abrir tests/testes.html manualmente
 *
 * Usa o Chrome DevTools Protocol para enviar teclas REAIS (Tab, Enter, Espaço)
 * e gerar capturas de tela nas larguras do CT10 em tests/screenshots/.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('404');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(exe) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'velha-'));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,1000', 'about:blank'
  ], { stdio: 'ignore' });
  const portFile = path.join(dataDir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  return { proc, dataDir, wsUrl: page.webSocketDebuggerUrl };
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { ready, send, close: () => ws.close() };
}

async function main() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes('--serve')) {
    console.log(`\n  Servidor ligado. Abra no navegador:\n\n    Testes: ${base}/tests/testes.html\n    Jogo:   ${base}/\n\n  (Ctrl+C para desligar)\n`);
    return;
  }

  const exe = findBrowser();
  if (!exe) { console.error('Chrome/Edge não encontrado. Defina a variável BROWSER.'); process.exit(2); }
  console.log('  Executando testes no navegador headless (≈30 s)...');
  const { proc, dataDir, wsUrl } = await launch(exe);
  const cdp = cdpClient(wsUrl);
  await cdp.ready;
  const evaluate = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'erro de avaliação');
    return r.result.value;
  };
  const goto = async url => {
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 50; i++) { await sleep(100); if (await evaluate('document.readyState') === 'complete') break; }
  };
  const key = async (keyName, code, vk, text) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, text });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk });
    await sleep(30);
  };

  const rows = [];
  let exitCode = 0;
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    /* 1) Página de homologação (CT01–CT10 + extras) */
    await goto(`${base}/tests/testes.html`);
    for (let i = 0; i < 600 && !(await evaluate('window.__DONE__ === true')); i++) await sleep(100);
    rows.push(...(await evaluate('window.__RESULTS__')) || []);

    /* 2) CT09 com teclado real: Tab até o tabuleiro, Enter e Espaço */
    await goto(`${base}/index.html`);
    await evaluate('localStorage.clear()');
    await goto(`${base}/index.html`);
    await evaluate("document.getElementById('btn-start').click()");
    await evaluate('document.activeElement.blur(); document.body.focus()');
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await key('Tab', 'Tab', 9);
      if (await evaluate("document.activeElement.matches('#board .cell[data-index=\"0\"]')")) { reached = true; break; }
    }
    const kb = { id: 'CT09-real', name: 'Teclado real (Tab + Enter + Espaço)', ok: false, detail: '' };
    try {
      if (!reached) throw new Error('Tab não alcançou a casa 1');
      const focusVisible = await evaluate("(() => { const a = document.activeElement; const cs = getComputedStyle(a); return a.matches(':focus-visible') && cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2; })()");
      if (!focusVisible) throw new Error('foco visível ausente');
      await key('Enter', 'Enter', 13, '\r');
      if (await evaluate("document.querySelectorAll('#board .cell')[0].dataset.mark") !== 'X') throw new Error('Enter não marcou X');
      await key('Tab', 'Tab', 9);
      await key(' ', 'Space', 32, ' ');
      if (await evaluate("document.querySelectorAll('#board .cell')[1].dataset.mark") !== 'O') throw new Error('Espaço não marcou O');
      kb.ok = true; kb.detail = 'Tab chegou ao tabuleiro, foco visível, Enter marcou X, Espaço marcou O';
    } catch (e) { kb.detail = e.message; }
    rows.push(kb);

    /* 3) Capturas de tela para inspeção visual do CT10 e dos estilos */
    const shotsDir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(shotsDir, { recursive: true });
    const shoot = async name => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(shotsDir, name + '.png'), Buffer.from(data, 'base64'));
    };
    const styles = ['croche', 'lousa', 'terminal', 'papel', 'marmore', 'aquarela'];
    for (const [width, mobile] of [[360, true], [768, false], [1440, false]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await goto(`${base}/index.html`);
      await evaluate('localStorage.clear()');
      await goto(`${base}/index.html`);
      await shoot(`setup-${width}`);
      for (const style of (width === 768 ? styles : ['lousa'])) {
        await evaluate(`(() => {
          if (!document.getElementById('screen-game').hidden) document.getElementById('btn-settings').click();
          document.querySelector('input[name=style][value=${style}]').checked = true;
          document.getElementById('btn-start').click();
          [0, 4, 1, 3, 8, 5].forEach(i => document.querySelectorAll('#board .cell')[i].click());
          document.activeElement.blur();
        })()`);
        await sleep(1200); // aguarda animações
        await shoot(`jogo-${style}-${width}`);
        await evaluate("document.getElementById('btn-new').click()");
      }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  } catch (e) {
    console.error('Erro no executor:', e);
    exitCode = 1;
  } finally {
    cdp.close();
    proc.kill();
    server.close();
    setTimeout(() => { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {} }, 500);
  }

  const failed = rows.filter(r => !r.ok);
  console.log('\n  ID         STATUS   CENÁRIO');
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(10)} ${r.ok ? '✔ passa' : '✖ FALHA'}  ${r.name}${r.ok ? '' : '  → ' + r.detail}`);
  }
  console.log(`\n  ${rows.length - failed.length}/${rows.length} verificações passaram. Capturas em tests/screenshots/\n`);
  process.exit(failed.length || !rows.length ? 1 : exitCode);
}

main();
