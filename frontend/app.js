(() => {
  'use strict';
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const $ = id => document.getElementById(id);
  const state = { files: [], activeId: null, mode: 'targetSize', strict: false, customDirectory: null, queue: [], running: false, hardware: [], language: localStorage.getItem('bitbento-language') || (navigator.language.toLowerCase().startsWith('zh')?'zh-CN':'en') };
  const labels = { queued:'等待', encoding:'正在压缩', encodingPass1:'编码第 1 遍', encodingPass2:'编码第 2 遍', verifying:'正在校验', completed:'已完成', failed:'失败', cancelled:'已取消' };
  const hardwareLabels = { auto:'自动选择', nvenc:'NVIDIA NVENC', qsv:'Intel Quick Sync', amf:'AMD AMF', cpu:'CPU 软件编码' };
  const allowed = { MP4:['H.264','H.265','AV1'], MKV:['H.264','H.265','AV1','VP9'], MOV:['H.264','H.265'], WebM:['AV1','VP9'] };
  const originalText = new WeakMap();
  const english = {
    '使用说明':'Guide','关于':'About','媒体列表':'Media Library','＋ 添加视频':'＋ Add Videos','全选':'Select All','清空':'Clear',
    '尚未添加视频，可使用按钮或拖放多个文件':'No videos yet. Add files or drag several videos here.',
    '批量输出设置':'Batch Output','文件名后缀':'Filename suffix','添加视频后显示文件名示例':'A filename example appears after adding a video.',
    '保存位置':'Save to','原视频所在文件夹':'Source video folder','自定义这一批视频的路径':'Choose one folder for this batch','选择':'Browse',
    '每个文件保存到各自原视频所在文件夹':'Each output is saved beside its source video.','硬件加速':'Hardware acceleration','自动选择（推荐）':'Auto (recommended)',
    '关闭硬件加速（CPU）':'CPU only','正在检测实际可用的编码器…':'Checking which encoders can actually start…','将选中文件加入输出队列':'Add Selected Videos to Queue','已勾选':'Selected','个 · 已保存参数':'· saved settings','个':'videos','总大小':'Total size','· 总时长':'· total duration',
    '文件详情':'Video Details','仅本地处理':'Local processing only','完全离线 · 不会上传文件':'Fully offline · Files are never uploaded','添加视频后可在此播放预览':'Add a video to preview it here.','请添加视频':'Add a video',
    '原文件大小':'Source size','时长':'Duration','视频编码':'Video codec','分辨率':'Resolution','帧率':'Frame rate','平均码率':'Average bitrate','预计输出大小':'Estimated output','原视频大小':'Source size','等待参数':'Waiting for settings',
    '压缩参数对比':'Compression Comparison','原视频 → 预计输出':'Source → Estimated','项目':'Item','原视频':'Source','预计输出':'Estimated','封装格式':'Container','音频':'Audio',
    '输出设置':'Output Settings','当前文件':'Current video','指定大小':'Target Size','专业参数':'Advanced','目标文件大小':'Target file size','预计目标（可输入）':'Target (editable)','原文件的 34%':'34% of source','更小文件':'Smaller file','更高画质':'Higher quality','不得超过目标大小':'Do not exceed target size','打开后自动预留安全空间':'Reserves headroom and verifies final bytes','目标容量较低，复杂运动画面可能出现明显细节损失。':'This target is very small; fast-moving scenes may lose visible detail.',
    '输出编码':'Output codec','H.265（自动）':'H.265 (automatic)','与原视频一致':'Same as source','预计画质':'Estimated quality','良好':'Good','优秀':'Excellent','较低':'Low','自定义导出':'Custom export','目标平均码率':'Target average bitrate','封装格式决定文件扩展名；视频编码决定画面压缩方式。':'The container determines the extension; the codec determines video compression.','“与原视频一致”仅在当前封装格式支持原编码时可用。':'“Same as source” is available only when the selected container supports that codec.','4K（3840 × 2160）':'4K (3840 × 2160)','2K（2560 × 1440）':'2K (2560 × 1440)','1080p（1920 × 1080）':'1080p (1920 × 1080)','720p（1280 × 720）':'720p (1280 × 720)',
    '高质量 · AAC 256 kbps':'High quality · AAC 256 kbps','标准 · AAC 192 kbps':'Standard · AAC 192 kbps','节省空间 · AAC 128 kbps':'Smaller · AAC 128 kbps','移除音频':'Remove audio','参数摘要':'Settings summary','预计文件大小':'Estimated size','码率方式':'Rate control','VBR（自动）':'VBR (automatic)','保存当前参数':'Save Current Settings','保存当前文件参数并应用到全部':'Save and Apply to All','保存后，左侧文件右侧会显示绿色勾并启用复选框。修改已保存的参数后，需要重新保存。':'A green check means the video has saved settings. Changes to compression settings must be saved again.',
    '输出队列':'Output Queue','开始全部压缩':'Start All','准备任务…':'Preparing…','队列中还没有任务':'The queue is empty.',
    '关于 BitBento':'About BitBento','开发者：Steve Chou':'Developer: Steve Chou','BitBento 是一款开源、完全离线的视频压缩工具。项目源代码及正式版本将通过官方 GitHub 仓库发布。':'BitBento is an open-source, fully offline video compressor. Source code and official releases will be published through the official GitHub repository.','免费软件声明':'Free Software Notice','BitBento 是一款免费提供的视频压缩工具，无需购买、订阅或支付任何费用。如果您通过第三方渠道获取本软件时被要求支付软件授权费用，请谨慎辨别，并优先通过官方 GitHub 仓库下载。本软件由 Steve Chou 开发与维护。':'BitBento is provided free of charge. No purchase, subscription, or payment is required. If a third-party source asks you to pay a software license fee, please verify the source and prefer the official GitHub repository. BitBento is developed and maintained by Steve Chou.','FFmpeg 及第三方组件的许可证信息随软件一同提供。':'Licenses for FFmpeg and other third-party components are included with the software.',
    '1. 添加视频':'1. Add videos','点击“添加视频”，或把多个视频直接拖入窗口。BitBento 会在本地读取媒体信息。':'Click “Add Videos” or drag several videos into the window. BitBento reads media information locally.','2. 设置压缩方式':'2. Choose a compression mode','“指定大小”会保持原分辨率和帧率，并自动计算码率；“专业参数”允许手动设置封装、编码、分辨率、帧率和音频。':'Target Size preserves the source resolution and frame rate while calculating bitrate automatically. Advanced mode lets you choose the container, codec, resolution, frame rate, and audio.','3. 保存并加入队列':'3. Save and queue','保存当前参数或应用到全部文件。绿色勾表示该文件已经有可用参数。':'Save settings for the current video or apply them to every video. A green check means the settings are ready.','4. 开始压缩':'4. Start compression','将勾选文件加入队列后点击“开始全部压缩”。任务会显示实际编码器、进度和剩余时间。所有处理均在本机完成。':'Add checked videos to the queue, then choose “Start All”. Each job shows the actual encoder, progress, and remaining time. All processing stays on this computer.',
    '关于':'About','一款轻量、简洁、注重隐私的本地视频压缩工具。':'A lightweight, focused, privacy-first local video compressor.','开发者':'Developer','软件版本':'Version','BitBento 源码许可':'BitBento source license','核心技术':'Core technologies','GitHub 项目主页':'GitHub Project','开源许可证':'Open-source license','查看 MIT License':'View MIT License','第三方开源声明':'Third-party notices','查看组件许可':'View component licenses','© 2026 Steve Chou. 依照项目许可证发布。':'© 2026 Steve Chou. Released under the project license.','BitBento 开源许可证':'BitBento Open-source License','BitBento 自有源代码依据 MIT License 开源。第三方组件不因此变更其各自许可证。':'BitBento-owned source code is released under the MIT License. Third-party components retain their own licenses.','FFmpeg 7.0.2':'FFmpeg 7.0.2','BitBento 随附 Gyan.dev 提供的 FFmpeg Windows 构建，用于完全离线的媒体分析和视频压缩。该构建依据 GNU General Public License v3 或更高版本（GPL-3.0-or-later）提供；FFmpeg 版权归其贡献者所有。':'BitBento bundles a Windows build of FFmpeg from Gyan.dev for fully offline media analysis and video compression. This build is provided under GNU GPL version 3 or later (GPL-3.0-or-later); FFmpeg is copyright its contributors.','Tauri 2 与 Rust 依赖':'Tauri 2 and Rust dependencies','桌面运行框架及 Rust 依赖分别依据其上游 MIT、Apache-2.0 或其他兼容开源许可证提供。完整许可证文本与来源说明保存在安装目录的第三方许可证文件中。':'The desktop framework and Rust dependencies are provided under their respective upstream MIT, Apache-2.0, or other compatible open-source licenses. Full license texts and source notices are included with the installation.','BitBento 的 MIT License 不覆盖 FFmpeg 或其他第三方组件；各组件仍受其原始许可证约束。':'BitBento’s MIT License does not cover FFmpeg or other third-party components; each remains governed by its original license.'
  };
  function applyLanguage() {
    const en=state.language==='en'; document.documentElement.lang=en?'en':'zh-CN'; document.title=en?'BitBento · Local Video Compression':'BitBento · 本地视频压缩'; $('languageSelect').value=state.language;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let node;
    while((node=walker.nextNode())){if(node.parentElement?.closest('script'))continue;if(!originalText.has(node))originalText.set(node,node.nodeValue);const source=originalText.get(node),trim=source.trim();if(!trim)continue;const translated=en&&english[trim]?english[trim]:trim;node.nodeValue=source.replace(trim,translated);}
    updateResolutionOptions(active());
  }
  const tr=(zh,en)=>state.language==='en'?en:zh;
  const hardwareLabel=mode=>mode==='auto'?tr('自动选择','Auto'):mode==='cpu'?tr('CPU 软件编码','CPU software'):hardwareLabels[mode]||mode;
  const statusLabel=status=>state.language==='en'?({queued:'Queued',encoding:'Encoding',encodingPass1:'Pass 1',encodingPass2:'Pass 2',verifying:'Verifying',completed:'Completed',failed:'Failed',cancelled:'Cancelled'}[status]||status):(labels[status]||status);
  const active = () => state.files.find(f => f.media.id === state.activeId) || null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalizeMediaPath = value => String(value ?? '').replace(/^\\\\\?\\/,'').replaceAll('/','\\').toLowerCase();
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

  const isPortrait = media => Boolean(media && media.height > media.width);

  function orientSettingsForMedia(settings, media) {
    const oriented={...settings};
    if (oriented.mode !== 'professional' || !oriented.width || !oriented.height || oriented.width === oriented.height) return oriented;
    const targetPortrait=oriented.height > oriented.width;
    if (isPortrait(media) !== targetPortrait) [oriented.width,oriented.height]=[oriented.height,oriented.width];
    return oriented;
  }

  function updateResolutionOptions(item=active(), desiredSettings=null) {
    const select=$('resolution'); if (!select) return;
    const selectedPreset=select.selectedOptions[0]?.dataset.preset || '4K';
    const portrait=isPortrait(item?.media);
    for (const option of select.options) {
      if (option.dataset.preset === 'same') { option.value='same'; option.textContent=tr('与原视频一致','Same as source'); continue; }
      const long=Number(option.dataset.long), short=Number(option.dataset.short); if (!long || !short) continue;
      const width=portrait?short:long, height=portrait?long:short;
      option.value=`${width}x${height}`;
      option.textContent=`${option.dataset.preset}${state.language==='en'?' (':'（'}${width} × ${height}${state.language==='en'?')':'）'}`;
    }
    if (desiredSettings?.width && desiredSettings?.height) {
      const oriented=orientSettingsForMedia(desiredSettings,item.media);
      select.value=`${oriented.width}x${oriented.height}`;
    } else {
      const option=[...select.options].find(candidate=>candidate.dataset.preset===selectedPreset);
      select.value=option?.value || 'same';
    }
  }

  function updatePreview(item) {
    const video = $('videoPreview'), empty = $('previewEmpty');
    if (!item) {
      video.pause(); video.removeAttribute('src'); video.load(); delete video.dataset.mediaId;
      video.classList.remove('ready','portrait'); empty.style.display='block'; empty.textContent=tr('添加视频后可在此播放预览','Add a video to preview it here.');
      return;
    }
    video.classList.toggle('portrait',isPortrait(item.media));
    if (video.dataset.mediaId === item.media.id) return;
    video.pause(); video.classList.remove('ready'); empty.style.display='block'; empty.textContent=tr('正在加载本地视频预览…','Loading local video preview…');
    video.dataset.mediaId=item.media.id; delete video.dataset.compatAttempted;
    video.src=`http://bitbento-media.localhost/${encodeURIComponent(item.media.id)}`;
    video.onloadedmetadata=()=>{video.classList.add('ready');empty.style.display='none';};
    video.onerror=async()=>{
      video.classList.remove('ready');empty.style.display='block';
      if(video.dataset.compatAttempted==='1'){empty.textContent=tr('无法生成兼容预览，但仍可正常压缩','A compatible preview could not be created, but compression is still available.');return;}
      video.dataset.compatAttempted='1';empty.textContent=tr('系统无法直接播放此编码，正在生成本地兼容预览…','This codec cannot play directly. Creating a local compatible preview…');
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
      if (state.files.some(f => normalizeMediaPath(f.media.path) === normalizeMediaPath(path))) continue;
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
        if (!state.files.some(f => normalizeMediaPath(f.media.path) === normalizeMediaPath(media.path))) { state.files.push({ media, configured:false, selected:false, dirty:false, settings:null, estimate:null }); added++; }
      }
      if (added) { state.activeId = state.files.at(-1).media.id; initializeControls(active()); renderAll(); toast(`已读取 ${added} 个真实视频`); }
    } catch (error) { toast(errorText(error), true); }
  }

  function initializeControls(item) {
    if (!item) return;
    updateResolutionOptions(item,item.settings);
    if (item.settings) { loadSettings(item.settings); return; }
    const targetMb = Math.max(1, Math.round(item.media.sizeBytes / 1048576 * .35));
    $('targetInput').value = targetMb; $('targetSlider').value = 35; $('targetInput').max = Math.ceil(item.media.sizeBytes / 1048576 * 2);
    $('bitrateSlider').value = Math.max(1, Math.min(30, ((item.media.averageBitrateKbps || 5000) / 1000 * .65))).toFixed(1);
    ensureCompatibility();
  }

  function currentSettings(item = active()) {
    if (!item) return null;
    const media = item.media;
    const res = $('resolution').value === 'same' ? null : $('resolution').value.split('x').map(Number);
    const fps = $('fps').value === 'same' ? null : Number($('fps').value);
    const audio = $('audio').value;
    const audioBitrate = audio === 'aac256' ? 256 : audio === 'aac128' ? 128 : audio === 'aac192' ? 192 : null;
    const professional = state.mode === 'professional';
    return {
      mode: state.mode,
      container: professional ? $('format').value : 'MP4',
      videoCodec: professional ? $('codec').value : 'H.265',
      bitrateKbps: state.mode === 'professional' ? Math.round(parseFloat($('bitrateSlider').value) * 1000) : null,
      width: professional && res ? res[0] : null,
      height: professional && res ? res[1] : null,
      frameRate: professional ? fps : null,
      audioMode: audio === 'remove' ? 'remove' : audio === 'same' ? 'same' : 'aac',
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
    settings=orientSettingsForMedia(settings,active().media);
    state.mode = settings.mode; state.strict = settings.strictTarget;
    $('strictToggle').classList.toggle('on', state.strict);
    $('format').value = settings.container;
    $('codec').value = settings.videoCodec;
    if (settings.bitrateKbps) $('bitrateSlider').value = settings.bitrateKbps / 1000;
    updateResolutionOptions(active(),settings); $('resolution').value = settings.width ? `${settings.width}x${settings.height}` : 'same';
    $('fps').value = settings.frameRate ? String(settings.frameRate) : 'same';
    $('audio').value = settings.audioMode === 'remove' ? 'remove' : settings.audioMode === 'same' ? 'same' : `aac${settings.audioBitrateKbps||192}`;
    if (settings.targetBytes) $('targetInput').value = Math.round(settings.targetBytes / 1048576);
    activateMode(state.mode, false); ensureCompatibility();
  }

  async function calculate(item = active(), settings = currentSettings(item)) {
    if (!item || !settings) return null;
    return invoke('estimate_job', { media:item.media, settings:orientSettingsForMedia(settings,item.media) });
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
    const container = $('format').value === 'same' ? item.media.container : $('format').value;
    const codecs = allowed[container] || allowed.MP4;
    [...$('codec').options].forEach(option => { const value = option.value === 'same' ? item.media.videoCodec : option.value; option.disabled = !codecs.includes(value); });
    const resolved = $('codec').value === 'same' ? item.media.videoCodec : $('codec').value;
    if (!codecs.includes(resolved)) $('codec').value = codecs[0];
  }

  function renderFiles() {
    $('fileList').innerHTML = state.files.length ? state.files.map(item => {
      const m = item.media, v = mediaView(m);
      return `<div class="file ${m.id === state.activeId ? 'active' : ''}" data-id="${escapeHtml(m.id)}"><input type="checkbox" ${item.selected?'checked':''} ${item.configured?'':'disabled'} data-check="${escapeHtml(m.id)}" aria-label="选择 ${escapeHtml(m.filename)}"><div class="thumb">${escapeHtml(m.container)}</div><div><div class="file-name">${escapeHtml(m.filename)}</div><div class="file-meta">${fmtBytes(m.sizeBytes)} · ${escapeHtml(v.res.replaceAll(' ',''))}</div><div class="file-path" title="${escapeHtml(m.path)}">${escapeHtml(m.path)}</div></div><span class="config-check ${item.configured?'done':''}" title="${item.dirty?'参数已修改，请重新保存':item.configured?'参数已保存':'参数未保存'}">${item.configured?'✓':'·'}</span></div>`;
    }).join('') : `<div class="empty-q">${tr('尚未添加视频，可使用按钮或拖放多个文件','No videos yet. Add files or drag several videos here.')}</div>`;
    $('fileCount').textContent = tr(`${state.files.length} 个文件`,`${state.files.length} video${state.files.length===1?'':'s'}`);
    const selected = state.files.filter(f => f.selected), configured = state.files.filter(f => f.configured);
    $('selectedCount').textContent = selected.length; $('configuredCount').textContent = configured.length;
    $('selectedSize').textContent = fmtBytes(selected.reduce((sum,f) => sum + f.media.sizeBytes, 0)); $('selectedDuration').textContent = fmtTime(selected.reduce((sum,f) => sum + f.media.durationMs, 0));
    $('addQueue').textContent = selected.length ? tr(`加入输出队列（${selected.length}）`,`Add to Queue (${selected.length})`) : tr('请选择文件','Select videos');
    $('selectAll').textContent = configured.length && configured.every(f => f.selected) ? tr('取消全选','Deselect All') : tr('全选','Select All');
    document.querySelectorAll('.file[data-id]').forEach(el => el.onclick = event => { if (event.target.type === 'checkbox') return; state.activeId = el.dataset.id; initializeControls(active()); renderAll(); });
    document.querySelectorAll('[data-check]').forEach(el => el.onchange = () => { const item = state.files.find(f => f.media.id === el.dataset.check); item.selected = el.checked; renderFiles(); });
  }

  async function updateDetail() {
    const item = active();
    updatePreview(item);
    if (!item) { $('stageName').textContent=tr('请添加视频','Add a video'); ['sourceSize','duration','sourceCodec','sourceResolution','sourceFps','sourceBitrate','sizeOutput','sizeOriginal'].forEach(id => $(id).textContent='—'); $('sizeSaving').textContent=tr('等待参数','Waiting for settings'); $('sizeFill').style.width='0'; return; }
    const m = item.media, v = mediaView(m), settings = currentSettings(item);
    $('stageName').textContent=m.filename; $('sourceSize').textContent=fmtBytes(m.sizeBytes); $('duration').textContent=fmtTime(m.durationMs); $('sourceCodec').textContent=m.videoCodec; $('sourceResolution').textContent=v.res; $('sourceFps').textContent=v.fps; $('sourceBitrate').textContent=v.bitrate;
    $('cmpFormatOld').textContent=m.container; $('cmpCodecOld').textContent=m.videoCodec; $('cmpResOld').textContent=v.res.replaceAll(' ',''); $('cmpFpsOld').textContent=v.fps; $('cmpAudioOld').textContent=v.audio;
    const targetMb = Math.max(1, Number($('targetInput').value)||1), targetPercent=Math.round(targetMb * 1048576 / m.sizeBytes * 100); $('targetRatio').textContent=tr(`原文件的 ${targetPercent}%`,`${targetPercent}% of source`);
    $('bitrateValue').textContent=`${Number($('bitrateSlider').value).toFixed(1)} Mbps`;
    $('suffixExample').textContent=`示例：${m.filename.replace(/\.[^.]+$/,'')}${$('fileSuffix').value}.${state.mode==='targetSize'?'mp4':({MP4:'mp4',MKV:'mkv',MOV:'mov',WebM:'webm'}[$('format').value]||m.extension)}`;
    try {
      const est = await calculate(item, settings); if (active() !== item) return;
      const percent = Math.round((1 - est.estimatedBytes / m.sizeBytes) * 100), ratio = Math.min(100, Math.max(1, est.estimatedBytes / m.sizeBytes * 100));
      $('sizeOriginal').textContent=fmtBytes(m.sizeBytes); $('sizeOutput').textContent=fmtBytes(est.estimatedBytes); $('sizeFill').style.width=`${ratio}%`; $('sizeSaving').textContent=percent>=0?tr(`预计节省 ${percent}%`,`About ${percent}% smaller`):tr(`预计增加 ${-percent}%`,`About ${-percent}% larger`);
      $('cmpFormatNew').textContent=est.resolvedContainer; $('cmpCodecNew').textContent=est.resolvedVideoCodec; $('cmpResNew').textContent=state.mode==='targetSize'?v.res.replaceAll(' ',''):`${est.resolvedWidth}×${est.resolvedHeight}`; $('cmpFpsNew').textContent=state.mode==='targetSize'?v.fps:est.resolvedFrameRate?`${est.resolvedFrameRate.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')} FPS`:tr('保持可变帧率','Preserve variable frame rate'); $('cmpAudioNew').textContent=est.resolvedAudio;
      $('autoCodec').textContent=`${est.resolvedVideoCodec}${tr('（自动）',' (automatic)')}`; $('proSummaryLine1').textContent=`${est.resolvedContainer} · ${est.resolvedVideoCodec} · ${est.resolvedWidth}×${est.resolvedHeight} · ${est.resolvedFrameRate?`${est.resolvedFrameRate.toFixed(2).replace(/\.00$/,'')} FPS`:tr('保持原帧率','Preserve source rate')}`; $('proSummaryLine2').textContent=`${(est.videoBitrateKbps/1000).toFixed(1)} Mbps · ${est.resolvedAudio}`; $('proEstimate').textContent=`${tr('约','About')} ${fmtBytes(est.estimatedBytes)}`;
      const quality=est.videoBitrateKbps<500?'low':est.videoBitrateKbps<1800?'good':'excellent'; $('qualityWarning').classList.toggle('show', quality==='low'); $('qualityText').className=`quality-${quality}`; $('qualityText').textContent=quality==='low'?tr('较低','Low'):quality==='good'?tr('良好','Good'):tr('优秀','Excellent');
    } catch (error) { $('sizeOutput').textContent='无法估算'; $('sizeSaving').textContent=errorText(error); }
  }

  function renderQueue() {
    $('queueCount').textContent=state.queue.length;
    $('queueList').innerHTML=state.queue.length ? state.queue.map(job => {
      const e=job.estimate, progress=job.progress||0, done=job.state==='completed';
      const actions = done ? `<span><button class="ghost" data-open="${escapeHtml(job.id)}" title="打开文件">文件</button><button class="ghost" data-folder="${escapeHtml(job.id)}" title="打开所在文件夹">目录</button></span>` : `<button class="remove" data-remove="${escapeHtml(job.id)}" title="${job.state.startsWith('encoding')?'取消任务':'移除任务'}">×</button>`;
      const detail = job.error ? `<details class="qmeta"><summary>技术详情</summary>${escapeHtml(job.error)}</details>` : '';
      const encoderText=job.effectiveEncoder?`${job.effectiveHardware?tr('硬件','Hardware'):tr('软件','Software')}：${job.effectiveEncoder}`:`${tr('请求','Requested')}：${hardwareLabel(job.settings.hardwareMode)}`;
      return `<div class="queue-item"><div><strong>${escapeHtml(e.outputPath.split(/[\\/]/).pop())}</strong><div class="qmeta">${escapeHtml(encoderText)}</div>${job.hardwareNotice?`<div class="qmeta">${escapeHtml(job.hardwareNotice)}</div>`:''}${detail}</div><div><div>${escapeHtml(`${e.resolvedContainer} · ${e.resolvedVideoCodec} · ${e.resolvedWidth}×${e.resolvedHeight}`)}</div><div class="qmeta">${(e.videoBitrateKbps/1000).toFixed(1)} Mbps · ${escapeHtml(e.resolvedAudio)}</div></div><div>${tr('预计','Est.')} ${fmtBytes(e.estimatedBytes)}</div><div class="qstatus">${escapeHtml(statusLabel(job.state))}${progress?` ${progress.toFixed(1)}%`:''}<br><span class="qmeta">${job.etaMs?tr(`剩余 ${fmtTime(job.etaMs)}`,`${fmtTime(job.etaMs)} left`):''}</span></div>${actions}</div>`;
    }).join('') : `<div class="empty-q">${tr('队列中还没有任务','The queue is empty.')}</div>`;
    document.querySelectorAll('[data-remove]').forEach(button => button.onclick=async()=>{ const job=state.queue.find(j=>j.id===button.dataset.remove); try { if (job.state.startsWith('encoding')||job.state==='verifying') await invoke('cancel_job',{id:job.id}); else { await invoke('remove_job',{id:job.id}); state.queue=state.queue.filter(j=>j.id!==job.id); renderQueue(); } } catch(e){toast(errorText(e),true);} });
    document.querySelectorAll('[data-open]').forEach(button => button.onclick=()=>{ const job=state.queue.find(j=>j.id===button.dataset.open); invoke('open_output_file',{path:job.outputPath}).catch(e=>toast(errorText(e),true)); });
    document.querySelectorAll('[data-folder]').forEach(button => button.onclick=()=>{ const job=state.queue.find(j=>j.id===button.dataset.folder); invoke('open_output_folder',{path:job.outputPath}).catch(e=>toast(errorText(e),true)); });
  }

  function renderAll(){ renderFiles(); renderQueue(); updateDetail(); }

  async function saveItem(item, settings) {
    const oriented=orientSettingsForMedia(settings,item.media); const estimate = await calculate(item, oriented); item.settings=structuredClone(oriented); item.estimate=estimate; item.configured=true; item.selected=true; item.dirty=false; return estimate;
  }

  async function applyBatchSettings() {
    for (const item of state.files.filter(file=>file.configured)) {
      const settings={...item.settings,suffix:$('fileSuffix').value,outputDirectoryMode:$('saveLocation').value,customOutputDirectory:state.customDirectory,hardwareMode:$('hardwareAccel').value};
      try { item.settings=settings; item.estimate=await calculate(item,settings); }
      catch(error) { toast(errorText(error),true); }
    }
    renderAll();
  }

  async function detectHardware() {
    try {
      state.hardware=await invoke('detect_hardware_encoders');
      for (const mode of ['nvenc','qsv','amf']) { const result=state.hardware.find(h=>h.mode===mode), option=[...$('hardwareAccel').options].find(o=>o.value===mode); option.disabled=!result?.available; option.textContent=`${hardwareLabels[mode]}${result?.available?'':tr('（不可用）',' (unavailable)')}`; }
      $('hardwareAccel').value=state.hardware.find(h=>h.mode==='nvenc'&&h.available)?'nvenc':'auto';
      const available=state.hardware.filter(h=>h.available&&h.mode!=='cpu').map(h=>h.label), unavailable=state.hardware.filter(h=>!h.available&&h.mode!=='cpu').map(h=>`${h.label}：${h.detail}`); const summary=available.length?tr(`已验证：${available.join('、')}`,`Verified: ${available.join(', ')}`):tr('未发现可初始化的硬件编码器；自动模式将使用 CPU','No hardware encoder could start; Auto will use the CPU.'); $('accelHint').textContent=[summary,...unavailable].join(state.language==='en'?'; ':'；'); $('accelHint').title=unavailable.join('\n');
    } catch(error){$('accelHint').textContent=tr(`硬件检测失败：${errorText(error)}`,`Hardware detection failed: ${errorText(error)}`);}
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
  $('fileSuffix').oninput=()=>{$('fileSuffix').value=$('fileSuffix').value.replace(/[\\/:*?"<>|]/g,'');applyBatchSettings();};
  $('saveLocation').onchange=async()=>{if($('saveLocation').value==='custom')$('chooseBatchFolder').click();else{state.customDirectory=null;$('pathPreview').textContent=tr('每个文件保存到各自原视频所在文件夹','Each output is saved beside its source video.');await applyBatchSettings();}};
  $('chooseBatchFolder').style.display='none'; $('chooseBatchFolder').onclick=async()=>{try{const path=await invoke('select_output_directory');if(path){state.customDirectory=path;$('pathPreview').textContent=path;$('chooseBatchFolder').style.display='block';await applyBatchSettings();}else if(!state.customDirectory){$('saveLocation').value='source';}}catch(e){toast(errorText(e),true);}};
  $('hardwareAccel').onchange=async()=>{const result=state.hardware.find(h=>h.mode===$('hardwareAccel').value);$('accelHint').textContent=result?.detail||tr('自动选择已通过初始化测试的最快编码器','Auto uses the fastest encoder that passed initialization.');await applyBatchSettings();};
  $('saveCurrent').onclick=async()=>{const item=active();if(!item)return toast('请先添加视频');try{await saveItem(item,currentSettings(item));renderAll();toast(`已保存 ${item.media.filename} 的参数`);}catch(e){toast(errorText(e),true);}};
  $('saveAll').onclick=async()=>{const source=active();if(!source)return toast('请先添加视频');const template=currentSettings(source);let saved=0;for(const item of state.files){try{await saveItem(item,{...template});saved++;}catch(e){item.configured=false;item.selected=false;}}renderAll();toast(`已为 ${saved} 个文件独立计算并保存参数`,saved===0);};
  $('addQueue').onclick=async()=>{const selected=state.files.filter(f=>f.selected&&f.configured);if(!selected.length)return toast('请先勾选已保存参数的文件');try{const requests=selected.map(item=>({id:uuid(),media:item.media,settings:item.settings}));const jobs=await invoke('enqueue_jobs',{requests});state.queue.push(...jobs);renderQueue();toast(`已加入 ${jobs.length} 个真实任务`);}catch(e){toast(errorText(e),true);}};
  $('toggleQueue').onclick=()=>$('queueDrawer').classList.toggle('open');
  $('clearQueue').onclick=async()=>{try{await invoke('clear_queue');state.queue=[];renderQueue();}catch(e){toast(errorText(e),true);}};
  $('renderAll').onclick=async()=>{if(!state.queue.some(j=>j.state==='queued'))return toast('输出队列中没有等待任务');try{$('progressWrap').style.display='block';state.running=true;await invoke('start_queue');}catch(e){toast(errorText(e),true);}};
  $('guideButton').onclick=()=>$('guideModal').classList.add('open'); $('aboutButton').onclick=()=>$('aboutModal').classList.add('open');
  $('projectHomepage').onclick=async()=>{try{await invoke('open_project_homepage');}catch(e){toast(errorText(e),true);}};
  $('licenseButton').onclick=()=>$('licenseModal').classList.add('open');
  $('thirdPartyButton').onclick=()=>$('thirdPartyModal').classList.add('open');
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$((button.dataset.close)).classList.remove('open'));
  document.querySelectorAll('.modal-backdrop').forEach(modal=>modal.onclick=event=>{if(event.target===modal)modal.classList.remove('open');});
  $('languageSelect').onchange=()=>{state.language=$('languageSelect').value;localStorage.setItem('bitbento-language',state.language);renderAll();applyLanguage();detectHardware();};

  listen('job-progress', ({payload})=>{const job=state.queue.find(j=>j.id===payload.jobId);if(!job)return;job.state=payload.state;job.progress=payload.percent;job.etaMs=payload.remainingMs;if(payload.outputPath){job.outputPath=payload.outputPath;job.estimate.outputPath=payload.outputPath;}if(payload.technicalDetail)job.error=payload.technicalDetail;$('progressBar').style.width=`${payload.percent}%`;$('progressPct').textContent=`${payload.percent.toFixed(1)}%`;$('progressLabel').textContent=payload.message||`${labels[payload.state]||payload.state} · 已用 ${fmtTime(payload.elapsedMs)}${payload.remainingMs?` · 剩余 ${fmtTime(payload.remainingMs)}`:''}`;renderQueue();if(payload.state==='failed')toast(`${payload.message} ${payload.technicalDetail||''}`,true);});
  listen('job-encoder',({payload})=>{const job=state.queue.find(j=>j.id===payload.jobId);if(!job)return;job.effectiveEncoder=payload.encoder;job.effectiveHardware=payload.hardware;job.hardwareNotice=payload.notice;renderQueue();});
  listen('queue-finished',()=>{state.running=false;$('progressLabel').textContent='队列处理完毕';toast('输出队列处理完毕');});
  listen('tauri://drag-drop',event=>addPaths(event.payload.paths||[]));
  listen('tauri://drag-enter',()=>document.body.style.outline='2px solid var(--accent)'); listen('tauri://drag-leave',()=>document.body.style.outline='');

  applyLanguage(); renderAll(); applyLanguage(); detectHardware(); invoke('get_app_info').catch(e=>toast(errorText(e),true));
})();
