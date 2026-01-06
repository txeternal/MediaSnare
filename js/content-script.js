// content-scripts.js 
// 检测页面中的视频资源
class VideoDetector {
  constructor() {
    this.detectedUrls = new Set();
    this.isPaused = false; // 新增：当前是否暂停检测
    this.currentHost = '';
    this.init();
  }

  init() {
    try {
      this.currentHost = new URL(window.location.href).hostname;
    } catch (e) {
      this.isPaused = true;
      return;
    }

    // 初始化时检查暂停状态
    this.checkPauseState();
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'PAUSE_STATE_CHANGED') {
        this.updatePauseState(message);
      }
    });

    if (!this.isPaused) {
      this.detectVideoTags();
      setTimeout(() => this.observeDOMChanges(), 1000);
      this.requestBackgroundResources();
    }

    // 监听来自background的新资源通知（添加暂停判断）
    chrome.runtime.onMessage.addListener((message) => {
      if (this.isPaused) return; // 暂停时忽略
      if (message.type === 'NEW_VIDEO_RESOURCE') {
        this.handleNewResource(message.resource);
      }
    });
  }
checkPauseState() {
    chrome.storage.local.get(['pausedHosts', 'isPausedAll'], (data) => {
      const pausedHosts = data.pausedHosts || [];
      const isPausedAll = data.isPausedAll || false;
      // 全局暂停 或 本站点暂停 → 标记为暂停
      this.isPaused = isPausedAll || pausedHosts.includes(this.currentHost);
    });
  }

  // 新增：更新暂停状态
  updatePauseState(message) {
    const { pausedHosts = [], isPausedAll = false } = message;
    this.isPaused = isPausedAll || pausedHosts.includes(this.currentHost);
    
    if (this.isPaused) {
      // 暂停：清空已检测的资源，停止发送消息
      this.detectedUrls.clear();
      console.log(`[视频检测] 已暂停 ${this.currentHost} 的资源检测`);
    } else {
      // 恢复：重新检测
      console.log(`[视频检测] 已恢复 ${this.currentHost} 的资源检测`);
      this.detectVideoTags();
      this.requestBackgroundResources();
    }
  }
  // 检测页面中的video标签
  detectVideoTags() {
    const videos = document.querySelectorAll('video, audio');  
    videos.forEach(video => {
      const sources = video.querySelectorAll('source');
      const urls = sources.length ? 
        Array.from(sources).map(s => s.src) : 
        [video.src].filter(Boolean);

      urls.forEach(url => {
        if (url && !this.detectedUrls.has(url) && this.isVideoResource(url)) {
          this.handleNewResource({ url, type: video.type });
        }
      });
    });
  }

  // 处理新资源
  handleNewResource(resource) {
    if (this.isPaused) return; // 暂停时不处理
    if (this.detectedUrls.has(resource.url)) return;
    this.detectedUrls.add(resource.url);
    window.postMessage({
      type: 'NEW_VIDEO_RESOURCE',
      resource: resource
    }, '*');
  }

  // 监听DOM变化
  observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.tagName === 'VIDEO' || node.tagName === 'SOURCE') {
            this.detectVideoTags();
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video, source');
            if (videos.length > 0) this.detectVideoTags();
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,  // 监听src属性变化
      attributeFilter: ['src']
    });
  }

  // 向background请求资源
  requestBackgroundResources() {
    chrome.runtime.sendMessage({ type: 'GET_VIDEO_RESOURCES' }, (response) => {
      if (response?.resources) {
        response.resources.forEach(resource => this.handleNewResource(resource));
      }
    });
  }

  // 检测是否为视频资源（复用background的逻辑）
  isVideoResource(url) {
    const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0] || '';
    const VIDEO_EXTENSIONS = ['mp4', 'm3u8', 'webm', 'mov', 'flv', 'avi', 'mkv', 'ts'];
    return VIDEO_EXTENSIONS.includes(ext);
  }
}

// 初始化检测器（确保在DOM就绪后执行）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new VideoDetector());
} else {
  new VideoDetector();
}