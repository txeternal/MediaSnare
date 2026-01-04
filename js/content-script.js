// 检测页面中的视频资源
class VideoDetector {
  constructor() {
    this.detectedUrls = new Set();
    this.init();
  }

  init() {
    // 立即检测现有视频标签
    this.detectVideoTags();
    // 监听DOM变化（延迟执行，确保页面加载完成）
    setTimeout(() => this.observeDOMChanges(), 1000);
    // 请求background中已拦截的资源
    this.requestBackgroundResources();
    // 监听来自background的新资源通知
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'NEW_VIDEO_RESOURCE') {
        this.handleNewResource(message.resource);
      }
    });
  }

  // 检测页面中的video标签
  detectVideoTags() {
    const videos = document.querySelectorAll('video, audio');  // 包含audio以防遗漏
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
    if (this.detectedUrls.has(resource.url)) return;
    this.detectedUrls.add(resource.url);
    // 发送给悬浮球
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