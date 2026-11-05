# BitBento Windows 11 x64 验收报告

测试日期：2026-11-05  
测试平台：Windows 11 x64  
版本：0.2.1

## 构建与发布

- `npm ci`：通过，3 个包，0 个漏洞。
- `npm run tauri dev`：通过，WebView 加载完成且控制台无错误。
- `cargo clippy --all-targets -- -D warnings`：通过。
- `cargo test`：2/2 单元测试通过。
- `cargo test -- --ignored`：2/2 真实媒体集成测试通过。
- Tauri release/NSIS：通过，生成双语 `release/BitBento-Setup.exe`（47,941,492 bytes，SHA-256 `06146ed408bb226caca7ed87ba8b19b5d2f4a68228212b9144533ddf308259c1`）。安装器包含 English / 简体中文并按 Windows 当前语言预选。
- 便携主程序：10,872,832 bytes，SHA-256 `a56d0dbaf61c0fa4eb785297c8a107fd33ef33e5d7d89648f6aa9570a8f31fd7`。
- 便携版：在 PATH 仅含 `C:\Windows\System32;C:\Windows` 的环境中启动并完成真实编码，未依赖全局 Node.js、Rust 或 FFmpeg。
- 安装版：静默安装、安装后启动、真实编码及静默卸载均通过；卸载移除了程序和 sidecar，保留用户输出及本地日志。
- Windows 子进程：FFmpeg、ffprobe 与 taskkill 全部经过统一 `CREATE_NO_WINDOW` 启动器；启动、探测、预览、编码、校验和取消不再创建控制台窗口。

## 真实媒体

后端使用内置 ffprobe 读取并验证：

- MP4：`测试 视频 O'Brien.mp4`，H.264/AAC，640×360，30 fps，6 秒。
- MOV：`東京 テスト.mov`，H.264/AAC，25 fps，5 秒。
- MKV：163 字符长路径中的 `长路径 样本.mkv`，HEVC/Opus，24 fps，5.008 秒。
- WebM：`web sample.webm`，VP9/Opus，30 fps，5.008 秒。
- VFR MP4：`手机 VFR 样本.mp4`，`r_frame_rate=120/1`、`avg_frame_rate=54000000/2008333`；UI/后端标记为可变帧率，没有显示伪造的恒定帧率。
- 本地播放：MP4/H.264 通过受限媒体协议直接播放，`readyState=4`、时长 6 秒；长路径 MKV/HEVC 通过离线 H.264/AAC 兼容预览加载，`readyState=4`、时长 5 秒。
- 竖版 MP4：`portrait-360x640.mp4`，H.264/AAC，360×640，30 fps，3 秒；发布版 WebView 实测 `videoWidth=360`、`videoHeight=640`、`object-fit=contain`、居中显示，651×350 的固定预览框保持不变并在两侧保留黑边，没有拉伸画面。

特殊字符、中文、日文、空格、撇号和长路径均通过 probe/encode 测试。原文件哈希和内容未被修改。

原生文件选择器与资源管理器拖放代码已接入真实 Tauri/Windows 路径事件，但本次自动化环境的 Windows UI helper 初始化失败（`helper_unknown_error: setup refresh had errors`），因此这两项未能完成鼠标级自动化复验；其余 WebView 与 Rust bridge 使用发布二进制直接验证。

## 设置、队列与编码

- 目标 MB/滑块双向同步、保存后改动标脏、应用全部逐文件重新估算、专业摘要固定两行：通过代码路径和 WebView DOM 验证。
- 指定大小模式强制保持源分辨率和源帧率；即使请求中残留专业模式的 4K/60 FPS 参数，后端也会忽略。640×360/30 FPS 实测对比栏完全一致。
- 修改批量文件名后缀、输出目录或硬件选项后，已保存文件仍保持绿色勾和选中状态，并重新计算输出路径。
- 默认硬件为 NVIDIA NVENC；本机不可用时才回退到自动选择。
- 队列已移除“独立 MP4 文件”等冗余描述，并显示实际编码器。
- “良好”和“优秀”使用不同绿色；批量后缀区域不再额外显示 `.mp4`。
- 应用内简体中文/English 可即时切换并记忆选择；英文文案采用独立撰写。关于页按分区布局展示 BitBento Logo、Steve Chou、版本、核心技术、GitHub 项目主页、MIT License、第三方开源声明和免费软件声明；许可证弹层及第三方声明弹层均通过发布版 WebView 验证。
- 使用说明已删除“批量输出设置可随时调整，不会清除已保存状态。”，发布版 DOM 复验不存在该句。
- 封装/编码兼容矩阵：通过。
- 不可能目标：编码前拒绝，单元测试通过。
- 严格目标：请求 600,000 bytes，自动模式实际选择 `hevc_nvenc`，最终发布版输出 590,739 bytes；输出校验通过且 H.265/AAC 音视频流完整。
- 专业模式：输出 `web sample_pro_test.webm` 为 349,452 bytes；VP9/Opus，音视频流完整。
- 队列：真实进度事件、已用时间、ETA、失败详情、连续任务和碰撞命名通过。
- 取消：终止 FFmpeg 进程树，临时 `.part` 和 pass log 均清理，原文件保留。
- 同名输出：自动生成 `(1)`、`(2)` 后缀，未覆盖已有文件。
- 便携版和安装版均通过 WebView→Tauri→Rust→内置 FFmpeg 的端到端实际编码。

## 硬件检测

检测不是仅检查编码器名称，而是逐个尝试初始化：

- Intel QSV：`h264_qsv`、`hevc_qsv` 可初始化；`av1_qsv` 不可用。
- NVIDIA NVENC：RTX 3050 Laptop GPU + 552.12 驱动下，`h264_nvenc`、`hevc_nvenc` 实际初始化并完成严格目标编码；该 GPU 不支持 AV1 编码。
- AMD AMF：当前机器不可初始化，UI 禁用并显示原因。
- CPU：`libx264`、`libx265`、`libaom-av1`、`libvpx-vp9` 可用。

自动模式只选已成功初始化且匹配目标编码的实现，并在队列中显示实际编码器。严格目标不再强制 CPU：硬件编码完成后校验字节数，超限时最多进行两次码率修正。

## 隐私与网络

- 生产源码扫描未发现 `fetch`、XHR、WebSocket、遥测、分析或上传实现；配置中的唯一 HTTPS 字符串是 Tauri JSON schema 地址，不在运行时访问。
- 正常启动和编码期间没有观察到 BitBento 的远程 TCP 连接。
- 所有媒体 probe/encode 均通过本地 sidecar 完成。

## FFmpeg 与许可证

- 版本：`ffmpeg 7.0.2-essentials_build-www.gyan.dev`。
- 来源：Gyan FFmpeg Essentials 7.0.2，GitHub 发布归档。选择该版本是因为 7.1.1/9.0.1 的 NVENC API 要求高于常见驱动，而 7.0.2 已在本机 552.12 驱动上验证。
- 上游归档 SHA-256：`d5308d30872b2739cf53169df61faba8639d39a19b20b91e611c177ef676f64c`（winget manifest 与下载文件一致）。
- `ffmpeg.exe` SHA-256：`33cf0d2a42486a59f74f3b3741d8ff71bed82169db7125e91804cf264b365a4a`。
- `ffprobe.exe` SHA-256：`af3c38d4a25acf3bf0f16c3e36b7f0700bbf8fc1159057186a6f3f1fe7cd1611`。
- 许可证：GPL-3.0-or-later；构建配置、FFmpeg LICENSE/README、Rust 依赖清单及可取得的许可证全文均随安装版和便携版发布。
- 未签名构建的 SmartScreen/代码签名限制已写入发布 README。

## 尚未完成的人工复验

- Windows 原生文件选择对话框中一次选择 MP4/MOV/MKV/WebM 的鼠标级操作。
- 从资源管理器把多个视频拖入窗口的鼠标级操作。

上述两项受当前 Codex Windows UI 自动化 helper 故障阻塞；实现、编译及对应真实路径处理已完成。除此之外，`docs/ACCEPTANCE_CHECKLIST.md` 中的项目均已通过自动化、真实媒体或发布二进制端到端验证。
