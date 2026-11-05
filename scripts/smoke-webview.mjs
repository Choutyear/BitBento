import path from 'node:path';

const debugPort = process.env.BITBENTO_CDP_PORT || '9222';
const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(response => response.json());
const target = targets.find(item => item.type === 'page' && item.title.includes('BitBento'));
if (!target) throw new Error('BitBento WebView debugging target not found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});
function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__bitbentoSmokeErrors=[];
    window.addEventListener('error', event => window.__bitbentoSmokeErrors.push(String(event.error || event.message)));
    window.addEventListener('unhandledrejection', event => window.__bitbentoSmokeErrors.push(String(event.reason)));`
});
await send('Page.reload', { ignoreCache: true });
await new Promise(resolve => setTimeout(resolve, 1200));

const dom = await evaluate(`({
  readyState: document.readyState,
  title: document.title,
  fileCount: document.getElementById('fileCount')?.textContent,
  queueCount: document.getElementById('queueCount')?.textContent,
  bridge: typeof window.__TAURI__?.core?.invoke,
  errors: window.__bitbentoSmokeErrors || []
})`);
if (dom.readyState !== 'complete' || dom.bridge !== 'function' || dom.errors.length) {
  throw new Error(`WebView initialization failed: ${JSON.stringify(dom)}`);
}

const appInfo = await evaluate(`window.__TAURI__.core.invoke('get_app_info')`);
if (!appInfo.backendReady || !String(appInfo.ffmpegVersion).includes('ffmpeg version')) {
  throw new Error(`Backend readiness failed: ${JSON.stringify(appInfo)}`);
}
const hardware = await evaluate(`window.__TAURI__.core.invoke('detect_hardware_encoders')`);
if (!hardware.some(item => item.mode === 'cpu' && item.available)) throw new Error('CPU encoder detection failed');

const mediaPath = path.join(process.cwd(), 'test-media', "测试 视频 O'Brien.mp4");
const expression = `(async () => {
  const invoke = window.__TAURI__.core.invoke;
  const listen = window.__TAURI__.event.listen;
  const media = await invoke('probe_media', { path: ${JSON.stringify(mediaPath)} });
  const settings = {
    mode:'professional', container:'MP4', videoCodec:'H.264', bitrateKbps:400,
    width:640, height:360, frameRate:30, audioMode:'aac', audioBitrateKbps:128,
    targetBytes:null, strictTarget:false, hardwareMode:'cpu', suffix:'_webview_smoke',
    outputDirectoryMode:'source', customOutputDirectory:null
  };
  const id = 'webview-smoke-' + Date.now();
  const jobs = await invoke('enqueue_jobs', { requests:[{ id, media, settings }] });
  return await new Promise(async (resolve, reject) => {
    let unlistenProgress;
    let unlistenFinished;
    const finish = value => { unlistenProgress?.(); unlistenFinished?.(); resolve(value); };
    unlistenProgress = await listen('job-progress', event => {
      if (event.payload.jobId !== id) return;
      if (event.payload.state === 'completed') finish(event.payload);
      if (event.payload.state === 'failed') reject(new Error(event.payload.technicalDetail || 'encode failed'));
    });
    unlistenFinished = await listen('queue-finished', () => {});
    await invoke('start_queue');
  });
})()`;
let timeout;
const completed = await Promise.race([
  evaluate(expression),
  new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('WebView queue smoke test timed out')), 45_000); })
]).finally(() => clearTimeout(timeout));

console.log(JSON.stringify({ dom, appInfo, hardware, completed }, null, 2));
socket.close();
