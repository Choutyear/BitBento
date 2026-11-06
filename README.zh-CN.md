<p align="center">
  <img src="frontend/bitbento-logo.png" width="112" alt="BitBento 标志">
</p>

<h1 align="center">BitBento</h1>

<p align="center"><strong>一款注重隐私、完全离线的 Windows 视频压缩工具。</strong></p>

<p align="center">
  <a href="promo/index.html"><img src="docs/images/button-website-zh.svg" alt="官方网站" height="40"></a>
  &nbsp;
  <a href="https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Setup.exe"><img src="docs/images/button-download-zh.svg" alt="下载软件" height="40"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

<p align="center">
  <img alt="平台" src="https://img.shields.io/badge/platform-Windows%2011%20x64-0078D4">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="许可证" src="https://img.shields.io/badge/license-MIT-49CF91">
  <img alt="隐私" src="https://img.shields.io/badge/processing-100%25%20offline-7B61FF">
</p>

BitBento 是一款使用 Tauri 2、Rust、FFmpeg 和 ffprobe 开发的免费开源桌面视频压缩软件。所有视频都只在本机处理：没有上传、账号、广告、订阅或遥测。

## 下载

请从 [GitHub Releases](https://github.com/Choutyear/BitBento/releases/latest) 下载最新版本。

| 文件 | 适用场景 |
| --- | --- |
| [BitBento-Setup.exe](https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Setup.exe) | 推荐使用。为当前 Windows 用户安装 BitBento，安装程序支持 English 和简体中文。 |
| [BitBento-Portable.zip](https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Portable.zip) | 解压完整文件夹后运行 `BitBento.exe`，无需安装。 |

BitBento 当前提供的是未签名构建，Windows SmartScreen 可能显示“未知发布者”提示。运行下载的文件前，请核对 Release 中提供的 SHA-256 校验值。

## 主要功能

- **指定大小模式**：选择期望的文件大小，同时保持原视频的分辨率和帧率。
- **专业参数模式**：自定义封装格式、视频编码、码率、分辨率、帧率和音频参数。
- **真实批量队列**：批量压缩视频，显示实时进度、已用时间和预计剩余时间；支持取消、同名避让和明确的错误信息。
- **硬件加速**：通过真实初始化验证 NVIDIA NVENC、Intel Quick Sync 和 AMD AMF 是否可用；CPU 编码始终可以作为后备方案。
- **准确读取媒体信息**：通过内置 ffprobe 读取 MP4、MOV、MKV、WebM、可变帧率、旋转元数据、Unicode 文件名和 Windows 长路径。
- **本地视频播放**：直接预览兼容视频；必要时会在本地生成临时兼容预览，不会上传文件。
- **双语界面**：可随时在 English 和简体中文之间切换，NSIS 安装程序也提供两种语言。
- **隐私优先**：没有网络处理、遥测、云服务 SDK、账号系统或广告。

## 工作方式

BitBento 使用 Tauri WebView 显示界面，由 Rust 后端完成所有特权操作。前端不能执行任意 Shell 命令。Rust 使用结构化参数调用经过校验的本地 FFmpeg 和 ffprobe sidecar，发送结构化任务事件，先写入临时文件，并且只在编码成功后生成最终输出文件。

在“不得超过目标大小”模式下，BitBento 会为封装和音频预留空间，在本机完成编码后检查实际字节数，并在需要时调整码率重试。只要硬件编码器已经通过初始化验证，此过程也可以继续使用硬件加速。

## 系统要求

- Windows 11 x64
- Microsoft Edge WebView2 Runtime（Windows 11 通常已自带）
- 如需硬件编码，需要受支持的显卡和较新的驱动程序

BitBento 自带 FFmpeg 和 ffprobe，普通用户不需要安装 FFmpeg、Node.js 或 Rust。

## 从源码构建

### 开发环境

- Windows 11 x64
- Microsoft C++ Build Tools，并安装 **Desktop development with C++** 工作负载
- Rust stable MSVC 工具链
- Node.js LTS 和 npm
- Microsoft Edge WebView2 Runtime
- 经过校验的 Gyan FFmpeg 7.0.2 Essentials Windows x64 压缩包

### 准备并构建

```powershell
git clone https://github.com/Choutyear/BitBento.git
cd BitBento
npm ci

powershell -ExecutionPolicy Bypass -File .\scripts\prepare-ffmpeg.ps1 `
  -ArchivePath C:\Downloads\ffmpeg-7.0.2-essentials_build.zip `
  -ExpectedSha256 d5308d30872b2739cf53169df61faba8639d39a19b20b91e611c177ef676f64c

npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\collect-release.ps1
```

安装包和便携版目录会生成到 `release/`。FFmpeg 可执行文件不会提交到 Git；准备脚本会先验证压缩包的 SHA-256，再安装 sidecar。

## 开发与测试

```powershell
npm run dev
cargo fmt --manifest-path .\src-tauri\Cargo.toml --all -- --check
cargo clippy --manifest-path .\src-tauri\Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path .\src-tauri\Cargo.toml --all-targets
cargo test --manifest-path .\src-tauri\Cargo.toml --all-targets -- --ignored --test-threads=1
```

被忽略的 Rust 测试需要先准备 FFmpeg sidecar，并会使用真实媒体验证探测、严格目标大小编码、专业模式编码、取消和清理。发布验收清单与最新 Windows 测试报告分别位于 [`docs/ACCEPTANCE_CHECKLIST.md`](docs/ACCEPTANCE_CHECKLIST.md) 和 [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)。

## 项目结构

```text
frontend/            已定稿的界面、本地化与队列交互
src-tauri/src/       Rust 命令、媒体探测、编码、队列与硬件检测
src-tauri/binaries/  sidecar 占位文件与随软件发布的许可证
scripts/             sidecar 准备、发布打包和 WebView 测试
docs/                产品规格、架构和验收记录
```

## 隐私

所有媒体分析、预览生成和视频编码均在本机完成。BitBento 不会上传文件名、元数据、视频、诊断信息或使用数据。技术日志仅保存在本机，用于排查错误。

## 免费软件声明

BitBento 是一款免费提供的视频压缩工具，无需购买、订阅或支付任何费用。如果您通过第三方渠道获取本软件时被要求支付软件授权费用，请谨慎辨别，并优先通过官方 [GitHub 仓库](https://github.com/Choutyear/BitBento) 下载。本软件由 Steve Chou 开发与维护。

## 许可证与第三方软件

BitBento 自有源代码依据 [MIT License](LICENSE) 开源。随附的 FFmpeg 构建依据 GPL-3.0-or-later 发布，其他依赖继续使用其各自的上游许可证。来源、构建信息和许可证文本请参阅 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) 以及 `src-tauri/binaries/licenses/`。

欢迎通过 GitHub Issues 和 Pull Requests 提交问题与改进。
