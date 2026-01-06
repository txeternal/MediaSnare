// 这是floating.js 
class FloatingController {
  constructor() {
    this.btn = null;
    this.panel = null;
    this.videoResources = [];
    this.hls = null; // 存储 Hls 实例，方便销毁
    this.artPlayerInstance = null;
    // this.initKeyboardLongPress();
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

    // 把播放器和列表分开，用一个 wrapper 撑开
    this.panel.innerHTML = `
      <div class="panel-header">嗅探到的资源</div>
      <div id="preview-wrapper" style="display:none;">
        <div id="artplayer-container"></div> 
        <div id="close-preview">关闭预览 ×</div>
      </div>
      <div class="resource-list-container"></div>
    `;
    document.body.appendChild(this.panel);

    this.panel.querySelector('#close-preview').onclick = () => {
      document.getElementById('preview-wrapper').style.display = 'none';
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      if (this.artPlayerInstance) {
        this.artPlayerInstance.destroy();
        this.artPlayerInstance = null;
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
  // 长按倍速
  initArtLongPress(art, wrapper) {
    let timer = null;
    let isLongPressing = false;
    let lastRate = 1.0;
    const SPEED = 2.0;

    const keydownHandler = (e) => {
      if (e.code !== 'ArrowRight' || wrapper.style.display === 'none') return;

      // 阻止原网页视频快进
      e.preventDefault();
      e.stopImmediatePropagation();

      if (timer || isLongPressing) return;

      timer = setTimeout(() => {
        isLongPressing = true;
        lastRate = art.playbackRate; // 记录之前的倍速
        art.playbackRate = SPEED;    // 使用 ArtPlayer API 改变倍速
        art.notice.show = `长按倍速中：${SPEED}x`; // 调用 Art 通知 UI
      }, 300);
    };

    const keyupHandler = (e) => {
      if (e.code !== 'ArrowRight') return;

      // 如果预览窗开着，同样要阻止原网页行为
      if (wrapper.style.display !== 'none') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }

      clearTimeout(timer);
      timer = null;

      if (isLongPressing) {
        art.playbackRate = lastRate;
        art.notice.show = `恢复原速：${lastRate}x`;
        isLongPressing = false;
      } else {
        // 短按逻辑：快进 5s
        art.currentTime += 5;
        art.notice.show = '快进 5s';
      }
    };

    //使用捕获模式确保我们比原网页更快拿到按键信号
    document.addEventListener('keydown', keydownHandler, true);
    document.addEventListener('keyup', keyupHandler, true);

    // 当播放器销毁时，自动移除 document 上的监听器
    art.on('destroy', () => {
      document.removeEventListener('keydown', keydownHandler, true);
      document.removeEventListener('keyup', keyupHandler, true);
    });
  }




  // 预览核心逻辑
  previewVideo(url) {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const wrapper = document.getElementById('preview-wrapper');
    const container = document.getElementById('artplayer-container');
    wrapper.style.display = 'block'; // 显示外层包裹框

    if (this.artPlayerInstance) {
      this.artPlayerInstance.destroy();
    }

    this.artPlayerInstance = new Artplayer({
      container: container,
      autoplay: true,
      url: url,
      theme: '#8e44ad',
      type: url.includes('m3u8') ? 'm3u8' : 'mp4',
      customType: {
        m3u8: (video, url, art) => {
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);

            // 当清单解析完成，提取分辨率层级
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (hls.levels.length > 1) {
                const quality = hls.levels.map((l, i) => {
                  let name = '';
                  if (l.height) {
                    // 如果有高度信息，显示 1080P, 720P 等
                    name = `${l.height}P`;
                  } else if (l.bitrate) {
                    // 如果没有高度，显示码率
                    const mbps = (l.bitrate / 1000000).toFixed(1);
                    name = `${mbps} Mbps`;
                  } else {
                    // 万一啥都没有，就用索引保底
                    name = `画质 ${i + 1}`;
                  }

                  return {
                    html: name,
                    value: i,
                  };
                });
                quality.unshift({ html: '自动', value: -1 });

                // 注入 ArtPlayer 的清晰度设置
                art.setting.update({
                  name: 'quality',
                  width: 100,
                  html: '清晰度',
                  selector: quality,
                  onSelect: (item) => {
                    hls.currentLevel = item.value;
                    art.notice.show = `正在切换至 ${item.html}`;
                    return item.html;
                  },
                });
              }
            });
            this.hls = hls;
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          }
        }
      },
      setting: true,      // 允许用户自己调速、选比例
      playbackRate: true, // 开启倍速播放
      pip: true,          // 开启画中画
      fullscreen: true,   // 全屏显示
      miniProgressBar: true, // 面板太小时显示迷你进度条
      lock: true,         // 锁定画面
      autoSize: true,     // 自动适配容器大小
    });
    this.initArtLongPress(this.artPlayerInstance, wrapper);
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
    } catch (e) { return 'video-file'; }
  }
}

(() => {
  if (window !== window.top) return;
  new FloatingController();
})();
