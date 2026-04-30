# 视频资源嗅探扩展

> 一个用于 **自动嗅探并列出当前网页视频资源** 的浏览器扩展，主要用于学习与研究网页媒体资源加载机制。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/txeternal/MediaSnare.svg)](https://github.com/txeternal/MediaSnare/stargazers)

本项目参考并致敬以下优秀开源项目：

* **Cat Catch（猫抓）**：[https://github.com/xifangczy/cat-catch](https://github.com/xifangczy/cat-catch)

---

## 功能简介

本扩展可在用户浏览网页时，自动监听网络请求，对视频相关资源进行分析与筛选，并以清晰、可读的形式展示出来。  
与其它同类扩展的区别：主要通过页面悬浮球展示视频列表，同时采用更先进（或许是）的视频播放器 artplayer5.3

---

## 快速开始

### 安装扩展

1. 克隆或下载本仓库
2. 打开 Chrome/Edge 浏览器，进入扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目的文件夹即可

### 使用方法

1. 安装完成后，访问包含视频资源的网页
2. 页面右下角会出现悬浮球按钮，显示检测到的视频数量
3. 点击悬浮球打开视频列表
4. 选择任意视频即可在线播放

---

## 已实现功能

### 1️. 视频资源嗅探

* 监听页面发起的网络请求
* 自动识别以下类型资源：

  * 普通视频文件（mp4 / webm / mov 等）
  * HLS 流媒体入口（m3u8）
  * DASH 流媒体资源

### 2️⃣. 视频长按倍速

* 长按鼠标右键可倍速播放（最高 16 倍速）
* 支持所有检测到的视频资源

### 3️⃣. 暂停嗅探

* 可选择在单站点暂停嗅探
* 可全局暂停嗅探
* 灵活的站点白名单管理

### 4️⃣. 悬浮球界面

* 实时显示检测到的视频数量
* 简洁美观的 UI 设计
* 支持拖动和折叠

### 5️⃣. 内置播放器

* 采用 ArtPlayer 5.3 播放器
* 支持 HLS、MP4 等多种格式
* 提供完整的播放控制功能

---



## 使用声明

本项目仅用于 **学习、研究与技术交流**  
请勿用于侵犯版权或违反相关法律法规的行为  
由此产生的一切后果由使用者自行承担  
由于本人技术有限，可能出现各种问题，请谅解  

---

## 技术栈

* **前端框架**: 原生 JavaScript
* **视频播放器**: [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) 5.3
* **HLS 支持**: [hls.js](https://github.com/video-dev/hls.js)
* **浏览器 API**: Chrome Extension Manifest V3

---

## 开发说明

### 项目结构

```
MediaSnare/
├── manifest.json          # 扩展配置文件
├── popup.html            # 弹出页面
├── js/
│   ├── background.js     # 后台脚本
│   ├── content-script.js # 内容脚本
│   ├── floating.js       # 悬浮球逻辑
│   ├── popup.js          # 弹出页面逻辑
│   └── utils.js          # 工具函数
├── css/
│   └── floating.css      # 悬浮球样式
└── lib/
    ├── artplayer.js      # ArtPlayer 播放器
    └── hls.min.js        # HLS.js 库
```

### 调试方法

1. 扩展页面：`chrome://extensions/` → 点击"检查视图"
2. 内容脚本：在目标网页按 F12 打开开发者工具
3. 查看控制台日志以了解嗅探情况

---

## 隐私政策
本扩展收集所有信息都在本地储存处理，不会发送到远程服务器，不包含任何跟踪器。

---
## 致谢

* [hls.js](https://github.com/video-dev/hls.js)
* [cat-catch](https://github.com/xifangczy/cat-catch)
* [ArtPlayer](https://github.com/zhw2590582/ArtPlayer)
* 感谢所有对 Web 媒体加载机制进行研究与分享的开发者

---

## License
MIT License
