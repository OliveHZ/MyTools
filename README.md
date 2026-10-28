# 朗读 · 跑马灯

纯静态单页工具，两块功能：

1. **语音朗读** —— 输入文字，调用设备自带的语音引擎（Web Speech API / `speechSynthesis`）朗读，可调语速、音调、音量、语音
2. **全屏跑马灯** —— 输入文字，全屏滚动展示，支持四个方向、速度、字号、颜色、LED 点阵与发光效果

无后端、无第三方依赖、无网络请求，全部逻辑在浏览器本地执行。

---

## 本地预览

直接双击 `index.html` 即可（脚本为经典 `<script>`，`file://` 下也能运行）。

如需模拟真实环境（PWA 图标、manifest 生效），起一个静态服务器：

```bash
# Python
python -m http.server 8080

# 或 Node
npx serve .
```

然后访问 <http://localhost:8080>。

---

## 部署到 GitHub Pages

```bash
cd WebGame
git init
git add .
git commit -m "feat: 朗读 + 跑马灯静态页"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库页面：

**Settings → Pages → Build and deployment**

- Source 选 `Deploy from a branch`
- Branch 选 `main`，目录选 `/ (root)`
- 保存后等待约 1 分钟

访问地址：`https://<你的用户名>.github.io/<仓库名>/`

> 仓库名如果直接叫 `<用户名>.github.io`，访问地址就是 `https://<用户名>.github.io/`。
> 本项目所有资源均为相对路径，放在子目录下也能正常工作。

---

## 手机端使用要点

### 语音朗读

| 事项 | 说明 |
|---|---|
| 语音来源 | 调用系统语音引擎，非在线接口。iOS 用系统语音，Android 用 Google TTS 或厂商引擎 |
| iOS 中文语音 | 若默认发音生硬，去 **设置 → 辅助功能 → 朗读内容 → 声音 → 中文** 下载「增强 / 高级」音质 |
| Android 中文语音 | 安装「Google 语音服务」或厂商 TTS 引擎，并在系统设置里下载中文语音包 |
| 无声音 | 检查静音开关、勿扰模式、媒体音量；iOS 首次播放必须由用户点击触发（已按此实现） |
| 语音列表为空 | 页面会轮询等待语音引擎加载，超过 5 秒仍为空则提示更换浏览器 |

### 全屏跑马灯

| 事项 | 说明 |
|---|---|
| iPhone 全屏 | iOS Safari 不支持对任意元素调用 Fullscreen API。页面用视口级浮层实现「伪全屏」；**想彻底隐藏地址栏，请用 Safari 的「分享 → 添加到主屏幕」，从桌面图标打开** |
| Android 全屏 | 走标准 Fullscreen API，可完全全屏 |
| 保持常亮 | 播放时自动申请 Wake Lock，屏幕不会自动熄灭（iOS 16.4+ / Android Chrome 支持） |
| 操作方式 | 点击屏幕任意位置呼出控制条（暂停 / 退出），3.2 秒后自动隐藏；桌面端支持 `空格` 暂停、`Esc` 退出 |

---

## 浏览器兼容

| 能力 | Chrome / Edge (Android) | Safari (iOS) | 说明 |
|---|---|---|---|
| 语音合成 | ✅ | ✅ 14+ | iOS 需用户手势触发首次发声 |
| 全屏 API | ✅ | ⚠️ iPad 支持，iPhone 不支持 | 已做降级 |
| Wake Lock | ✅ | ✅ 16.4+ | 不支持时静默降级 |
| `color-mix` / `dvh` 等新特性 | — | — | 未使用，保证老设备可用 |

最低支持：iOS 13 / Android Chrome 80。

---

## 目录结构

```
WebGame/
├── index.html                  页面结构
├── manifest.webmanifest        PWA 清单（添加到主屏幕）
├── assets/
│   ├── css/app.css             全部样式
│   ├── js/
│   │   ├── app.js              公共能力：存储、Toast、屏幕常亮、Tab
│   │   ├── tts.js              语音朗读
│   │   └── marquee.js          全屏跑马灯
│   └── img/
│       ├── icon.svg            矢量图标
│       ├── icon-180.png        iOS 主屏图标
│       ├── icon-192.png        PWA 图标
│       └── icon-512.png        PWA 图标
├── tools/make-icons.py         图标生成脚本（纯标准库，可重新生成 PNG）
└── .nojekyll                   跳过 GitHub Pages 的 Jekyll 处理
```

---

## 实现说明

**朗读分句**：文本按 `。！？；…` 与换行切分为独立语句，超长句（> 90 字）再硬切。逐句排队发声，规避部分内核长句被截断的问题，同时给出「第 N / 共 M 句」进度与高亮。

**无缝滚动**：轨道按视口尺寸复制 N 份文本（`N = ceil(视口 / 单份宽度) + 1`），逐帧位移 `offset`，并对 `offset % 单份长度` 取模回绕。因为内容周期性重复，回绕瞬间视觉上完全连续。

**状态持久化**：文本、语音、语速、音调、音量、滚动参数全部写入 `localStorage`，刷新不丢。

---

## 二次开发提示

- 想加「朗读时同步高亮到跑马灯」：在 `tts.js` 的 `u.onstart` 里调用 `window.WB` 暴露的接口即可（当前两个模块互相独立）
- 想离线可用：加一个 Service Worker 缓存 4 个静态资源即可，本项目刻意未加，避免缓存导致更新不生效
- 想换默认文字：改 `tts.js` 的 `SAMPLE` 与 `marquee.js` 的 `SAMPLE`
