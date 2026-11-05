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
let preview = null;
let compatiblePreview = null;
let ui020 = null;
if (process.env.BITBENTO_TEST_PREVIEW === '1') {
  await evaluate(`window.__TAURI__.event.emit('tauri://drag-drop', { paths:[${JSON.stringify(mediaPath)}] })`);
  await new Promise(resolve => setTimeout(resolve, 1800));
  preview = await evaluate(`({
    fileCount: document.getElementById('fileCount')?.textContent,
    src: document.getElementById('videoPreview')?.currentSrc,
    readyState: document.getElementById('videoPreview')?.readyState,
    duration: document.getElementById('videoPreview')?.duration,
    error: document.getElementById('videoPreview')?.error?.message || null,
    visible: document.getElementById('videoPreview')?.classList.contains('ready')
  })`);
  if (preview.fileCount !== '1 个文件' || preview.readyState < 1 || !preview.visible || preview.error) {
    throw new Error(`Local preview failed: ${JSON.stringify(preview)}`);
  }
}
if (process.env.BITBENTO_TEST_UI_020 === '1') {
  ui020 = await evaluate(`(async()=>{
    document.querySelector('[data-mode="target"]').click();
    document.getElementById('saveCurrent').click();
    await new Promise(resolve=>setTimeout(resolve,350));
    const before={configured:document.getElementById('configuredCount').textContent,checked:document.querySelector('.config-check.done')?.textContent,resOld:document.getElementById('cmpResOld').textContent,resNew:document.getElementById('cmpResNew').textContent,fpsOld:document.getElementById('cmpFpsOld').textContent,fpsNew:document.getElementById('cmpFpsNew').textContent};
    const suffix=document.getElementById('fileSuffix');suffix.value='_batch_changed';suffix.dispatchEvent(new Event('input',{bubbles:true}));
    const hardware=document.getElementById('hardwareAccel');hardware.value='nvenc';hardware.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,350));
    const after={configured:document.getElementById('configuredCount').textContent,checked:document.querySelector('.config-check.done')?.textContent};
    const language=document.getElementById('languageSelect');language.value='en';language.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,250));
    const english={guide:document.getElementById('guideButton').textContent,about:document.getElementById('aboutButton').textContent,mediaHeading:document.querySelector('.source-panel .panel-head h2').textContent};
    language.value='zh-CN';language.dispatchEvent(new Event('change',{bubbles:true}));
    return {before,after,english,hardwareDefault:hardware.value};
  })()`);
  if(ui020.before.configured!=='1'||ui020.before.checked!=='✓'||ui020.after.configured!=='1'||ui020.after.checked!=='✓'||ui020.before.resOld.replaceAll(' ','')!==ui020.before.resNew.replaceAll(' ','')||ui020.before.fpsOld!==ui020.before.fpsNew||ui020.english.guide!=='Guide'||ui020.english.about!=='About'||ui020.english.mediaHeading!=='Media Library')throw new Error(`0.2 UI regression: ${JSON.stringify(ui020)}`);
}
if (process.env.BITBENTO_TEST_COMPAT === '1') {
  const mkvPath = path.join(process.cwd(), 'test-media', '长路径测试_abcdefghijklmnopqrstuvwxyz_0123456789', '第二层_日本語とスペース_abcdefghijklmnopqrstuvwxyz', '长路径 样本.mkv');
  compatiblePreview = await evaluate(`(async()=>{
    const media=await window.__TAURI__.core.invoke('probe_media',{path:${JSON.stringify(mkvPath)}});
    const previewId=await window.__TAURI__.core.invoke('create_compatible_preview',{id:media.id});
    const video=document.createElement('video');
    video.src='http://bitbento-media.localhost/'+encodeURIComponent(previewId);
    document.body.appendChild(video);
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error(video.error?.message||'preview load failed'));video.load();});
    const result={previewId,readyState:video.readyState,duration:video.duration,error:video.error?.message||null};video.remove();return result;
  })()`);
  if (compatiblePreview.readyState < 1 || compatiblePreview.error) throw new Error(`Compatible preview failed: ${JSON.stringify(compatiblePreview)}`);
}
const strictNvenc = process.env.BITBENTO_TEST_STRICT_NVENC === '1';
const smokeSettings = strictNvenc ? {
  mode:'targetSize', container:'MP4', videoCodec:'H.265', bitrateKbps:null,
  width:null, height:null, frameRate:null, audioMode:'aac', audioBitrateKbps:128,
  targetBytes:600000, strictTarget:true, hardwareMode:'auto', suffix:'_webview_nvenc_strict',
  outputDirectoryMode:'source', customOutputDirectory:null
} : {
  mode:'professional', container:'MP4', videoCodec:'H.264', bitrateKbps:400,
  width:640, height:360, frameRate:30, audioMode:'aac', audioBitrateKbps:128,
  targetBytes:null, strictTarget:false, hardwareMode:'cpu', suffix:'_webview_smoke',
  outputDirectoryMode:'source', customOutputDirectory:null
};
const expression = `(async () => {
  const invoke = window.__TAURI__.core.invoke;
  const listen = window.__TAURI__.event.listen;
  const media = await invoke('probe_media', { path: ${JSON.stringify(mediaPath)} });
  const settings = ${JSON.stringify(smokeSettings)};
  const id = 'webview-smoke-' + Date.now();
  const jobs = await invoke('enqueue_jobs', { requests:[{ id, media, settings }] });
  return await new Promise(async (resolve, reject) => {
    let unlistenProgress;
    let unlistenFinished;
    let unlistenEncoder;
    let encoderInfo=null;
    const finish = value => { unlistenProgress?.(); unlistenFinished?.(); unlistenEncoder?.(); resolve({...value,encoderInfo}); };
    unlistenEncoder = await listen('job-encoder', event => { if(event.payload.jobId===id)encoderInfo=event.payload; });
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
if (strictNvenc && (completed.encoderInfo?.encoder !== 'hevc_nvenc' || !completed.encoderInfo?.hardware)) {
  throw new Error(`Strict target did not use NVENC: ${JSON.stringify(completed.encoderInfo)}`);
}

console.log(JSON.stringify({ dom, appInfo, hardware, preview, compatiblePreview, ui020, completed }, null, 2));
socket.close();
