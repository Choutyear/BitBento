# BitBento Windows 11 x64 验收报告

测试日期：2026-11-05  
测试平台：Windows 11 x64  
版本：0.1.0

## 构建与发布

- `npm ci`：通过，3 个包，0 个漏洞。
- `npm run tauri dev`：通过，WebView 加载完成且控制台无错误。
- `cargo clippy --all-targets -- -D warnings`：通过。
- `cargo test`：2/2 单元测试通过。
- `cargo test -- --ignored`：2/2 真实媒体集成测试通过。
- Tauri release/NSIS：通过，生成 `release/BitBento-Setup.exe`（57,205,126 bytes，SHA-256 `e931f9f76f455b12944e6982dcd9dfcc6b277ce304582052ec2300f1a3e94278`）。
- 便携版：在 PATH 仅含 `C:\Windows\System32;C:\Windows` 的环境中启动并完成真实编码，未依赖全局 Node.js、Rust 或 FFmpeg。
- 安装版：静默安装、安装后启动、真实编码及静默卸载均通过；卸载移除了程序和 sidecar，保留用户输出及本地日志。

## 真实媒体

后端使用内置 ffprobe 读取并验证：

- MP4：`测试 视频 O'Brien.mp4`，H.264/AAC，640×360，30 fps，6 秒。
- MOV：`東京 テスト.mov`，H.264/AAC，25 fps，5 秒。
- MKV：163 字符长路径中的 `长路径 样本.mkv`，HEVC/Opus，24 fps，5.008 秒。
- WebM：`web sample.webm`，VP9/Opus，30 fps，5.008 秒。
- VFR MP4：`手机 VFR 样本.mp4`，`r_frame_rate=120/1`、`avg_frame_rate=54000000/2008333`；UI/后端标记为可变帧率，没有显示伪造的恒定帧率。

特殊字符、中文、日文、空格、撇号和长路径均通过 probe/encode 测试。原文件哈希和内容未被修改。

原生文件选择器与资源管理器拖放代码已接入真实 Tauri/Windows 路径事件，但本次自动化环境的 Windows UI helper 初始化失败（`helper_unknown_error: setup refresh had errors`），因此这两项未能完成鼠标级自动化复验；其余 WebView 与 Rust bridge 使用发布二进制直接验证。

## 设置、队列与编码

- 目标 MB/滑块双向同步、保存后改动标脏、应用全部逐文件重新估算、专业摘要固定两行：通过代码路径和 WebView DOM 验证。
- 封装/编码兼容矩阵：通过。
- 不可能目标：编码前拒绝，单元测试通过。
- 严格目标：请求 600,000 bytes，输出 `测试 视频 O'Brien_strict_test.mp4` 为 509,364 bytes；H.265/AAC，音视频流完整。
- 专业模式：输出 `web sample_pro_test.webm` 为 349,452 bytes；VP9/Opus，音视频流完整。
- 队列：真实进度事件、已用时间、ETA、失败详情、连续任务和碰撞命名通过。
- 取消：终止 FFmpeg 进程树，临时 `.part` 和 pass log 均清理，原文件保留。
- 同名输出：自动生成 `(1)`、`(2)` 后缀，未覆盖已有文件。
- 便携版和安装版均通过 WebView→Tauri→Rust→内置 FFmpeg 的端到端实际编码。

## 硬件检测

检测不是仅检查编码器名称，而是逐个尝试初始化：

- Intel QSV：`h264_qsv`、`hevc_qsv` 可初始化；`av1_qsv` 不可用。
- NVIDIA NVENC：当前机器不可初始化，UI 禁用并显示原因。
- AMD AMF：当前机器不可初始化，UI 禁用并显示原因。
- CPU：`libx264`、`libx265`、`libaom-av1`、`libvpx-vp9` 可用。

自动模式只选已成功初始化且匹配目标编码的实现；硬件不可用会以中文提示并保持 CPU 可选。严格目标选择硬件时的限制已在 UI/发布说明中记录。

## 隐私与网络

- 生产源码扫描未发现 `fetch`、XHR、WebSocket、遥测、分析或上传实现；配置中的唯一 HTTPS 字符串是 Tauri JSON schema 地址，不在运行时访问。
- 正常启动和编码期间没有观察到 BitBento 的远程 TCP 连接。
- 所有媒体 probe/encode 均通过本地 sidecar 完成。

## FFmpeg 与许可证

- 版本：`ffmpeg 9.0.1-essentials_build-www.gyan.dev`。
- 来源：Gyan FFmpeg Essentials 9.0.1，GitHub 发布归档。
- 上游归档 SHA-256：`fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9`（winget 安装时校验通过）。
- `ffmpeg.exe` SHA-256：`72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3`。
- `ffprobe.exe` SHA-256：`19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f`。
- 许可证：GPL-3.0-or-later；构建配置、FFmpeg LICENSE/README、Rust 依赖清单及可取得的许可证全文均随安装版和便携版发布。
- 未签名构建的 SmartScreen/代码签名限制已写入发布 README。

## 尚未完成的人工复验

- Windows 原生文件选择对话框中一次选择 MP4/MOV/MKV/WebM 的鼠标级操作。
- 从资源管理器把多个视频拖入窗口的鼠标级操作。

上述两项受当前 Codex Windows UI 自动化 helper 故障阻塞；实现、编译及对应真实路径处理已完成。除此之外，`docs/ACCEPTANCE_CHECKLIST.md` 中的项目均已通过自动化、真实媒体或发布二进制端到端验证。
