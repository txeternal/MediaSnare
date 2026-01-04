class FloatingController {
  constructor() {
    this.btn = null;
    this.panel = null;
    this.videoResources = [];
    this.hls = null; // 存储 Hls 实例，方便销毁
    this.init().catch(err => console.error('Floating init error:', err));
  }

  async init() {
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }
    this.createFloatingButton();
    this.createResourcePanel();
    this.listenResourceUpdates();
  }

  createFloatingButton() {
    if (document.getElementById('video-floating-btn')) return;
    this.btn = document.createElement('div');
    this.btn.id = 'video-floating-btn';
    // 换一个更有“侦探”感觉的图标
    this.btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
    document.body.appendChild(this.btn);

    this.btn.addEventListener('click', () => {
      this.panel.classList.toggle('visible');
    });
  }

  createResourcePanel() {
    if (document.getElementById('video-resource-panel')) return;
    this.panel = document.createElement('div');
    this.panel.id = 'video-resource-panel';
    // 增加预览区域
    this.panel.innerHTML = `
      <div class="panel-header">嗅探到的资源</div>
      <div id="video-preview-container" style="display:none;">
        <video id="main-preview-video" controls></video>
        <div id="close-preview">关闭预览 ×</div>
      </div>
      <div class="resource-list-container"></div>
    `;
    document.body.appendChild(this.panel);

    // 预览关闭逻辑
    this.panel.querySelector('#close-preview').onclick = () => {
      const container = document.getElementById('video-preview-container');
      container.style.display = 'none';
      const video = document.getElementById('main-preview-video');
      video.pause();
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
    };
  }

  listenResourceUpdates() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data.type !== 'NEW_VIDEO_RESOURCE') return;
      this.addResource(event.data.resource);
    });
  }

  addResource(resource) {
    if (this.videoResources.some(r => r.url === resource.url)) return;
    this.videoResources.push(resource);
    this.updateResourcePanel();
    this.showFloatingButton();
  }

  updateResourcePanel() {
    const listContainer = this.panel.querySelector('.resource-list-container');
    listContainer.innerHTML = this.videoResources.map(resource => `
      <div class="resource-item" data-url="${resource.url}">
        <div class="resource-title">${this.getFileNameFromUrl(resource.url)}</div>
        <div class="resource-info">
          <span>${resource.type || '视频资源'}</span>
          <button class="mini-download-btn" data-url="${resource.url}">下载</button>
        </div>
      </div>
    `).join('');

    // 绑定预览事件 (点击项)
    listContainer.querySelectorAll('.resource-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('mini-download-btn')) return;
        this.previewVideo(item.getAttribute('data-url'));
      });
    });

    // 绑定下载事件 (点击下载按钮)
    listContainer.querySelectorAll('.mini-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadResource(btn.getAttribute('data-url'));
      });
    });
  }

  // --- 新增：预览核心逻辑 ---
  previewVideo(url) {
    const container = document.getElementById('video-preview-container');
    const video = document.getElementById('main-preview-video');
    container.style.display = 'block';

    // 如果之前有 HLS 实例，先销毁
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (url.includes('.m3u8')) {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        this.hls = new Hls();
        this.hls.loadSource(url);
        this.hls.attachMedia(video);
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
      } else {
        alert('当前环境不支持 M3U8 播放');
      }
    } else {
      video.src = url;
      video.play();
    }
  }

  showFloatingButton() {
    this.btn.classList.add('visible');
    this.btn.offsetHeight; 
  }

  downloadResource(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = this.getFileNameFromUrl(url);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileNameFromUrl(url) {
    try {
        const path = new URL(url).pathname;
        return path.split('/').pop() || 'video-file';
    } catch(e) { return 'video-file'; }
  }
}

(() => {
  new FloatingController();
})();