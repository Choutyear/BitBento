(() => {
  'use strict';
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const $ = id => document.getElementById(id);
  const state = { files: [], activeId: null, mode: 'targetSize', strict: false, customDirectory: null, queue: [], running: false, hardware: [] };
  const labels = { queued:'等待', encoding:'正在压缩', encodingPass1:'编码第 1 遍', encodingPass2:'编码第 2 遍', verifying:'正在校验', completed:'已完成', failed:'失败', cancelled:'已取消' };
  const hardwareLabels = { auto:'自动选择', nvenc:'NVIDIA NVENC', qsv:'Intel Quick Sync', amf:'AMD AMF', cpu:'CPU 软件编码' };
  const allowed = { MP4:['H.264','H.265','AV1'], MKV:['H.264','H.265','AV1','VP9'], MOV:['H.264','H.265'], WebM:['AV1','VP9'] };
  const active = () => state.files.find(f => f.media.id === state.activeId) || null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtBytes = bytes => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${Math.max(0, Math.round(bytes / 1048576))} MB`;
  const fmtTime = ms => { const seconds = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const uuid = () => crypto.randomUUID();

  function toast(message, error = false) {
    const el = $('toast'); el.textContent = message; el.style.borderColor = error ? 'var(--red)' : ''; el.classList.add('show');
    el.getAnimations().forEach(a => a.cancel());
    el.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none',offset:.12},{opacity:1,transform:'none',offset:.82},{opacity:0,transform:'translateY(10px)'}], {duration:2600,easing:'ease'}).finished.finally(() => el.classList.remove('show'));
  }
  const errorText = error => typeof error === 'string' ? error : (error?.message || JSON.stringify(error));

  function mediaView(media) {
    return {
      res: `${media.width} × ${media.height}`,
      fps: media.frameRateText || '未知',
      bitrate: media.averageBitrateKbps ? `${(media.averageBitrateKbps / 1000).toFixed(2)} Mbps` : '未知',
      audio: media.audioCodec ? `${media.audioCodec}${media.audioBitrateKbps ? ` ${media.audioBitrateKbps} kbps` : ''}` : '无音频'
    };
  }

  function updatePreview(item) {
    const video = $('videoPreview'), empty = $('previewEmpty');
    if (!item) {
      video.pause(); video.removeAttribute('src'); video.load(); delete video.dataset.mediaId;
      video.classList.remove('ready'); empty.style.display='block'; empty.textContent='添加视频后可在此播放预览';
      return;
    }
    if (video.dataset.mediaId === item.media.id) return;
    video.pause(); video.classList.remove('ready'); empty.style.display='block'; empty.textContent='正在加载本地视频预览…';
    video.dataset.mediaId=item.media.id; delete video.dataset.compatAttempted;
    video.src=`http://bitbento-media.localhost/${encodeURIComponent(item.media.id)}`;
    video.onloadedmetadata=()=>{video.classList.add('ready');empty.style.display='none';};
    video.onerror=async()=>{
      video.classList.remove('ready');empty.style.display='block';
      if(video.dataset.compatAttempted==='1'){empty.textContent='无法生成兼容预览，但仍可正常压缩';return;}
      video.dataset.compatAttempted='1';empty.textContent='系统无法直接播放此编码，正在生成本地兼容预览…';
      const mediaId=item.media.id;
      try{const previewId=await invoke('create_compatible_preview',{id:mediaId});if(video.dataset.mediaId!==mediaId)return;video.src=`http://bitbento-media.localhost/${encodeURIComponent(previewId)}`;video.load();}
      catch(error){if(video.dataset.mediaId===mediaId)empty.textContent=`兼容预览生成失败：${errorText(error)}`;}
    };
    video.load();
  }

  async function addPaths(paths) {
    const supported = paths.filter(p => /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(p));
    let added = 0;
    for (const path of supported) {
      if (state.files.some(f => f.media.path.toLowerCase() === path.toLowerCase())) continue;
      try { const media = await invoke('probe_media', { path }); state.files.push({ media, configured:false, selected:false, dirty:false, settings:null, estimate:null }); added++; }
      catch (error) { toast(`无法读取 ${path.split(/[\\/]/).pop()}：${errorText(error)}`, true); }
    }
    if (added) { state.activeId = state.files.at(-1).media.id; initializeControls(active()); renderAll(); toast(`已读取 ${added} 个真实视频`); }
  }

  async function pickFiles() {
    try {
      const mediaItems = await invoke('select_media_files');
      let added = 0;
      for (const media of mediaItems) {
        if (!state.files.some(f => f.media.path.toLowerCase() === media.path.toLowerCase())) { state.files.push({ media, configured:false, selected:false, dirty:false, settings:null, estimate:null }); added++; }
      }
      if (added) { state.activeId = state.files.at(-1).media.id; initializeControls(active()); renderAll(); toast(`已读取 ${added} 个真实视频`); }
    } catch (error) { toast(errorText(error), true); }
  }

  function initializeControls(item) {
    if (!item) return;
    if (item.settings) { loadSettings(item.settings); return; }
    const targetMb = Math.max(1, Math.round(item.media.sizeBytes / 1048576 * .35));
    $('targetInput').value = targetMb; $('targetSlider').value = 35; $('targetInput').max = Math.ceil(item.media.sizeBytes / 1048576 * 2);
    $('bitrateSlider').value = Math.max(1, Math.min(30, ((item.media.averageBitrateKbps || 5000) / 1000 * .65))).toFixed(1);
    ensureCompatibility();
  }

  function currentSettings(item = active()) {
    if (!item) return null;
    const media = item.media;
    const containerMap = {'与原视频一致':'same','MP4':'MP4','MKV':'MKV','MOV':'MOV','WebM':'WebM'};
    const codecMap = {'与原视频一致':'same','H.264':'H.264','H.265':'H.265','AV1':'AV1','VP9':'VP9'};
    const res = $('resolution').value.match(/（(\d+)\s*×\s*(\d+)）/);
    const fps = $('fps').value === '与原视频一致' ? null : parseFloat($('fps').value);
    const audio = $('audio').value;
    const audioBitrate = audio.includes('256') ? 256 : audio.includes('128') ? 128 : audio.includes('192') ? 192 : null;
    return {
      mode: state.mode,
      container: containerMap[$('format').value] || 'same',
      videoCodec: codecMap[$('codec').value] || 'same',
      bitrateKbps: state.mode === 'professional' ? Math.round(parseFloat($('bitrateSlider').value) * 1000) : null,
      width: res ? Number(res[1]) : null,
      height: res ? Number(res[2]) : null,
      frameRate: fps,
      audioMode: audio === '移除音频' ? 'remove' : audio === '与原视频一致' ? 'same' : 'aac',
      audioBitrateKbps: audioBitrate,
      targetBytes: state.mode === 'targetSize' ? Math.round(Math.max(1, Number($('targetInput').value)) * 1048576) : null,
      strictTarget: state.strict,
      hardwareMode: $('hardwareAccel').value,
      suffix: $('fileSuffix').value,
      outputDirectoryMode: $('saveLocation').value,
      customOutputDirectory: state.customDirectory
    };
  }

  function loadSettings(settings) {
    state.mode = settings.mode; state.strict = settings.strictTarget;
    $('strictToggle').classList.toggle('on', state.strict);
    $('format').value = settings.container === 'same' ? '与原视频一致' : settings.container;
    $('codec').value = settings.videoCodec === 'same' ? '与原视频一致' : settings.videoCodec;
    if (settings.bitrateKbps) $('bitrateSlider').value = settings.bitrateKbps / 1000;
    $('resolution').value = settings.width ? [...$('resolution').options].find(o => o.text.includes(`${settings.width} × ${settings.height}`))?.value || '与原视频一致' : '与原视频一致';
    $('fps').value = settings.frameRate ? `${settings.frameRate} FPS` : '与原视频一致';
    $('audio').value = settings.audioMode === 'remove' ? '移除音频' : settings.audioMode === 'same' ? '与原视频一致' : [...$('audio').options].find(o => o.text.includes(String(settings.audioBitrateKbps)))?.value || '标准 · AAC 192 kbps';
    if (settings.targetBytes) $('targetInput').value = Math.round(settings.targetBytes / 1048576);
    activateMode(state.mode, false); ensureCompatibility();
  }

  async function calculate(item = active(), settings = currentSettings(item)) {
    if (!item || !settings) return null;
    return invoke('estimate_job', { media:item.media, settings });
  }

  function markDirty() {
    const item = active(); if (!item?.configured) return;
    item.configured = false; item.selected = false; item.dirty = true; item.estimate = null; renderFiles();
  }

  function markAllDirty() {
    state.files.forEach(item => { if (item.configured) { item.configured=false; item.selected=false; item.dirty=true; item.estimate=null; } });
    renderFiles();
  }

  function activateMode(mode, dirty = true) {
    state.mode = mode;
    document.querySelectorAll('.mode-tab').forEach(el => el.classList.toggle('active', (el.dataset.mode === 'target' ? 'targetSize' : 'professional') === mode));
    $('targetPane').classList.toggle('active', mode === 'targetSize'); $('proPane').classList.toggle('active', mode === 'professional');
    if (dirty) markDirty(); updateDetail();
  }

  function ensureCompatibility() {
    const item = active(); if (!item) return;
    const container = $('format').value === '与原视频一致' ? item.media.container : $('format').value;
    const codecs = allowed[container] || allowed.MP4;
    [...$('codec').options].forEach(option => { const value = option.value === '与原视频一致' ? item.media.videoCodec : option.value; option.disabled = !codecs.includes(value); });
    const resolved = $('codec').value === '与原视频一致' ? item.media.videoCodec : $('codec').value;
    if (!codecs.includes(resolved)) $('codec').value = codecs[0];
  }

  function renderFiles() {
    $('fileList').innerHTML = state.files.length ? state.files.map(item => {
      const m = item.media, v = mediaView(m);
      return `<div class="file ${m.id === state.activeId ? 'active' : ''}" data-id="${escapeHtml(m.id)}"><input type="checkbox" ${item.selected?'checked':''} ${item.configured?'':'disabled'} data-check="${escapeHtml(m.id)}" aria-label="选择 ${escapeHtml(m.filename)}"><div class="thumb">${escapeHtml(m.container)}</div><div><div class="file-name">${escapeHtml(m.filename)}</div><div class="file-meta">${fmtBytes(m.sizeBytes)} · ${escapeHtml(v.res.replaceAll(' ',''))}</div><div class="file-path" title="${escapeHtml(m.path)}">${escapeHtml(m.path)}</div></div><span class="config-check ${item.configured?'done':''}" title="${item.dirty?'参数已修改，请重新保存':item.configured?'参数已保存':'参数未保存'}">${item.configured?'✓':'·'}</span></div>`;
    }).join('') : '<div class="empty-q">尚未添加视频，可使用按钮或拖放多个文件</div>';
    $('fileCount').textContent = `${state.files.length} 个文件`;
    const selected = state.files.filter(f => f.selected), configured = state.files.filter(f => f.configured);
    $('selectedCount').textContent = selected.length; $('configuredCount').textContent = configured.length;
    $('selectedSize').textContent = fmtBytes(selected.reduce((sum,f) => sum + f.media.sizeBytes, 0)); $('selectedDuration').textContent = fmtTime(selected.reduce((sum,f) => sum + f.media.durationMs, 0));
    $('addQueue').textContent = selected.length ? `加入输出队列（${selected.length}）` : '请选择文件';
    $('selectAll').textContent = configured.length && configured.every(f => f.selected) ? '取消全选' : '全选';
    document.querySelectorAll('.file[data-id]').forEach(el => el.onclick = event => { if (event.target.type === 'checkbox') return; state.activeId = el.dataset.id; initializeControls(active()); renderAll(); });
    document.querySelectorAll('[data-check]').forEach(el => el.onchange = () => { const item = state.files.find(f => f.media.id === el.dataset.check); item.selected = el.checked; renderFiles(); });
  }

  async function updateDetail() {
    const item = active();
    updatePreview(item);
    if (!item) { $('stageName').textContent='请添加视频'; ['sourceSize','duration','sourceCodec','sourceResolution','sourceFps','sourceBitrate','sizeOutput','sizeOriginal'].forEach(id => $(id).textContent='—'); $('sizeSaving').textContent='等待参数'; $('sizeFill').style.width='0'; return; }
    const m = item.media, v = mediaView(m), settings = currentSettings(item);
    $('stageName').textContent=m.filename; $('sourceSize').textContent=fmtBytes(m.sizeBytes); $('duration').textContent=fmtTime(m.durationMs); $('sourceCodec').textContent=m.videoCodec; $('sourceResolution').textContent=v.res; $('sourceFps').textContent=v.fps; $('sourceBitrate').textContent=v.bitrate;
    $('cmpFormatOld').textContent=m.container; $('cmpCodecOld').textContent=m.videoCodec; $('cmpResOld').textContent=v.res.replaceAll(' ',''); $('cmpFpsOld').textContent=v.fps; $('cmpAudioOld').textContent=v.audio;
    const targetMb = Math.max(1, Number($('targetInput').value)||1); $('targetRatio').textContent=`原文件的 ${Math.round(targetMb * 1048576 / m.sizeBytes * 100)}%`;
    $('bitrateValue').textContent=`${Number($('bitrateSlider').value).toFixed(1)} Mbps`;
    $('suffixExample').textContent=`示例：${m.filename.replace(/\.[^.]+$/,'')}${$('fileSuffix').value}.${state.mode==='targetSize'?'mp4':({MP4:'mp4',MKV:'mkv',MOV:'mov',WebM:'webm'}[$('format').value]||m.extension)}`;
    try {
      const est = await calculate(item, settings); if (active() !== item) return;
      const percent = Math.round((1 - est.estimatedBytes / m.sizeBytes) * 100), ratio = Math.min(100, Math.max(1, est.estimatedBytes / m.sizeBytes * 100));
      $('sizeOriginal').textContent=fmtBytes(m.sizeBytes); $('sizeOutput').textContent=fmtBytes(est.estimatedBytes); $('sizeFill').style.width=`${ratio}%`; $('sizeSaving').textContent=percent>=0?`预计节省 ${percent}%`:`预计增加 ${-percent}%`;
      $('cmpFormatNew').textContent=est.resolvedContainer; $('cmpCodecNew').textContent=est.resolvedVideoCodec; $('cmpResNew').textContent=`${est.resolvedWidth}×${est.resolvedHeight}`; $('cmpFpsNew').textContent=est.resolvedFrameRate?`${est.resolvedFrameRate.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')} FPS`:'保持可变帧率'; $('cmpAudioNew').textContent=est.resolvedAudio;
      $('autoCodec').textContent=`${est.resolvedVideoCodec}（自动）`; $('proSummaryLine1').textContent=`${est.resolvedContainer} · ${est.resolvedVideoCodec} · ${est.resolvedWidth}×${est.resolvedHeight} · ${est.resolvedFrameRate?`${est.resolvedFrameRate.toFixed(2).replace(/\.00$/,'')} FPS`:'保持原帧率'}`; $('proSummaryLine2').textContent=`${(est.videoBitrateKbps/1000).toFixed(1)} Mbps · ${est.resolvedAudio}`; $('proEstimate').textContent=`约 ${fmtBytes(est.estimatedBytes)}`;
      $('qualityWarning').classList.toggle('show', est.videoBitrateKbps < 500); $('qualityText').textContent=est.videoBitrateKbps<500?'较低':est.videoBitrateKbps<1800?'良好':'优秀';
    } catch (error) { $('sizeOutput').textContent='无法估算'; $('sizeSaving').textContent=errorText(error); }
  }

  function renderQueue() {
    $('queueCount').textContent=state.queue.length;
    $('queueList').innerHTML=state.queue.length ? state.queue.map(job => {
      const e=job.estimate, progress=job.progress||0, done=job.state==='completed';
      const actions = done ? `<span><button class="ghost" data-open="${escapeHtml(job.id)}" title="打开文件">文件</button><button class="ghost" data-folder="${escapeHtml(job.id)}" title="打开所在文件夹">目录</button></span>` : `<button class="remove" data-remove="${escapeHtml(job.id)}" title="${job.state.startsWith('encoding')?'取消任务':'移除任务'}">×</button>`;
      const detail = job.error ? `<details class="qmeta"><summary>技术详情</summary>${escapeHtml(job.error)}</details>` : '';
      const encoderText=job.effectiveEncoder?`${job.effectiveHardware?'硬件':'软件'}：${job.effectiveEncoder}`:`请求：${hardwareLabels[job.settings.hardwareMode]}`;
      return `<div class="queue-item"><div><strong>${escapeHtml(e.outputPath.split(/[\\/]/).pop())}</strong><div class="qmeta">独立 ${escapeHtml(e.resolvedContainer)} 文件<br>${escapeHtml(encoderText)}</div>${job.hardwareNotice?`<div class="qmeta">${escapeHtml(job.hardwareNotice)}</div>`:''}${detail}</div><div><div>${escapeHtml(`${e.resolvedContainer} · ${e.resolvedVideoCodec} · ${e.resolvedWidth}×${e.resolvedHeight}`)}</div><div class="qmeta">${(e.videoBitrateKbps/1000).toFixed(1)} Mbps · ${escapeHtml(e.resolvedAudio)}</div></div><div>预计 ${fmtBytes(e.estimatedBytes)}</div><div class="qstatus">${escapeHtml(labels[job.state]||job.state)}${progress?` ${progress.toFixed(1)}%`:''}<br><span class="qmeta">${job.etaMs?`剩余 ${fmtTime(job.etaMs)}`:''}</span></div>${actions}</div>`;
    }).join('') : '<div class="empty-q">队列中还没有任务</div>';
    document.querySelectorAll('[data-remove]').forEach(button => button.onclick=async()=>{ const job=state.queue.find(j=>j.id===button.dataset.remove); try { if (job.state.startsWith('encoding')||job.state==='verifying') await invoke('cancel_job',{id:job.id}); else { await invoke('remove_job',{id:job.id}); state.queue=state.queue.filter(j=>j.id!==job.id); renderQueue(); } } catch(e){toast(errorText(e),true);} });
    document.querySelectorAll('[data-open]').forEach(button => button.onclick=()=>{ const job=state.queue.find(j=>j.id===button.dataset.open); invoke('open_output_file',{path:job.outputPath}).catch(e=>toast(errorText(e),true)); });
    document.querySelectorAll('[data-folder]').forEach(button => button.onclick=()=>{ const job=state.queue.find(j=>j.id===button.dataset.folder); invoke('open_output_folder',{path:job.outputPath}).catch(e=>toast(errorText(e),true)); });
  }

  function renderAll(){ renderFiles(); renderQueue(); updateDetail(); }

  async function saveItem(item, settings) {
    const estimate = await calculate(item, settings); item.settings=structuredClone(settings); item.estimate=estimate; item.configured=true; item.selected=true; item.dirty=false; return estimate;
  }

  async function detectHardware() {
    try {
      state.hardware=await invoke('detect_hardware_encoders');
      for (const mode of ['nvenc','qsv','amf']) { const result=state.hardware.find(h=>h.mode===mode), option=[...$('hardwareAccel').options].find(o=>o.value===mode); option.disabled=!result?.available; option.textContent=`${hardwareLabels[mode]}${result?.available?'':'（不可用）'}`; }
      const available=state.hardware.filter(h=>h.available&&h.mode!=='cpu').map(h=>h.label), unavailable=state.hardware.filter(h=>!h.available&&h.mode!=='cpu').map(h=>`${h.label}：${h.detail}`); const summary=available.length?`已验证：${available.join('、')}`:'未发现可初始化的硬件编码器；自动模式将使用 CPU'; $('accelHint').textContent=[summary,...unavailable].join('；'); $('accelHint').title=unavailable.join('\n');
    } catch(error){$('accelHint').textContent=`硬件检测失败：${errorText(error)}`;}
  }

  document.querySelectorAll('.mode-tab').forEach(el=>el.onclick=()=>activateMode(el.dataset.mode==='target'?'targetSize':'professional'));
  $('addVideo').onclick=pickFiles;
  $('selectAll').onclick=()=>{const list=state.files.filter(f=>f.configured), select=!list.length||!list.every(f=>f.selected); list.forEach(f=>f.selected=select); renderFiles();};
  $('clearFiles').onclick=()=>{const ids=state.files.map(item=>item.media.id);state.files=[];state.activeId=null;renderAll();ids.forEach(id=>invoke('unregister_preview',{id}).catch(()=>{}));toast('已清空媒体列表');};
  $('strictToggle').onclick=()=>{state.strict=!state.strict;$('strictToggle').classList.toggle('on',state.strict);markDirty();updateDetail();};
  $('targetSlider').oninput=()=>{const item=active();if(!item)return;$('targetInput').value=Math.max(1,Math.round(item.media.sizeBytes/1048576*Number($('targetSlider').value)/100));markDirty();updateDetail();};
  $('targetInput').oninput=()=>{const item=active();if(!item)return;$('targetSlider').value=Math.max(10,Math.min(95,Math.round(Number($('targetInput').value)*1048576/item.media.sizeBytes*100)));markDirty();updateDetail();};
  ['bitrateSlider','resolution','fps','audio'].forEach(id=>$(id).oninput=()=>{markDirty();updateDetail();});
  $('format').onchange=()=>{ensureCompatibility();markDirty();updateDetail();}; $('codec').onchange=()=>{ensureCompatibility();markDirty();updateDetail();};
  $('fileSuffix').oninput=()=>{$('fileSuffix').value=$('fileSuffix').value.replace(/[\\/:*?"<>|]/g,'');markAllDirty();updateDetail();};
  $('saveLocation').onchange=async()=>{if($('saveLocation').value==='custom')$('chooseBatchFolder').click();else{state.customDirectory=null;$('pathPreview').textContent='每个文件保存到各自原视频所在文件夹';markAllDirty();}};
  $('chooseBatchFolder').style.display='none'; $('chooseBatchFolder').onclick=async()=>{try{const path=await invoke('select_output_directory');if(path){state.customDirectory=path;$('pathPreview').textContent=path;$('chooseBatchFolder').style.display='block';markAllDirty();}}catch(e){toast(errorText(e),true);}};
  $('hardwareAccel').onchange=()=>{markAllDirty();const result=state.hardware.find(h=>h.mode===$('hardwareAccel').value);$('accelHint').textContent=result?.detail||'自动选择已通过初始化测试的最快编码器';};
  $('saveCurrent').onclick=async()=>{const item=active();if(!item)return toast('请先添加视频');try{await saveItem(item,currentSettings(item));renderAll();toast(`已保存 ${item.media.filename} 的参数`);}catch(e){toast(errorText(e),true);}};
  $('saveAll').onclick=async()=>{const source=active();if(!source)return toast('请先添加视频');const template=currentSettings(source);let saved=0;for(const item of state.files){try{await saveItem(item,{...template});saved++;}catch(e){item.configured=false;item.selected=false;}}renderAll();toast(`已为 ${saved} 个文件独立计算并保存参数`,saved===0);};
  $('addQueue').onclick=async()=>{const selected=state.files.filter(f=>f.selected&&f.configured);if(!selected.length)return toast('请先勾选已保存参数的文件');try{const requests=selected.map(item=>({id:uuid(),media:item.media,settings:item.settings}));const jobs=await invoke('enqueue_jobs',{requests});state.queue.push(...jobs);renderQueue();toast(`已加入 ${jobs.length} 个真实任务`);}catch(e){toast(errorText(e),true);}};
  $('toggleQueue').onclick=()=>$('queueDrawer').classList.toggle('open');
  $('clearQueue').onclick=async()=>{try{await invoke('clear_queue');state.queue=[];renderQueue();}catch(e){toast(errorText(e),true);}};
  $('renderAll').onclick=async()=>{if(!state.queue.some(j=>j.state==='queued'))return toast('输出队列中没有等待任务');try{$('progressWrap').style.display='block';state.running=true;await invoke('start_queue');}catch(e){toast(errorText(e),true);}};

  listen('job-progress', ({payload})=>{const job=state.queue.find(j=>j.id===payload.jobId);if(!job)return;job.state=payload.state;job.progress=payload.percent;job.etaMs=payload.remainingMs;if(payload.outputPath){job.outputPath=payload.outputPath;job.estimate.outputPath=payload.outputPath;}if(payload.technicalDetail)job.error=payload.technicalDetail;$('progressBar').style.width=`${payload.percent}%`;$('progressPct').textContent=`${payload.percent.toFixed(1)}%`;$('progressLabel').textContent=payload.message||`${labels[payload.state]||payload.state} · 已用 ${fmtTime(payload.elapsedMs)}${payload.remainingMs?` · 剩余 ${fmtTime(payload.remainingMs)}`:''}`;renderQueue();if(payload.state==='failed')toast(`${payload.message} ${payload.technicalDetail||''}`,true);});
  listen('job-encoder',({payload})=>{const job=state.queue.find(j=>j.id===payload.jobId);if(!job)return;job.effectiveEncoder=payload.encoder;job.effectiveHardware=payload.hardware;job.hardwareNotice=payload.notice;renderQueue();});
  listen('queue-finished',()=>{state.running=false;$('progressLabel').textContent='队列处理完毕';toast('输出队列处理完毕');});
  listen('tauri://drag-drop',event=>addPaths(event.payload.paths||[]));
  listen('tauri://drag-enter',()=>document.body.style.outline='2px solid var(--accent)'); listen('tauri://drag-leave',()=>document.body.style.outline='');

  renderAll(); detectHardware(); invoke('get_app_info').catch(e=>toast(errorText(e),true));
})();
