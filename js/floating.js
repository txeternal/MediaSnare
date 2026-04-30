// 这是 floating.js 

// ==================== M3U8 下载器 ====================
class M3U8Downloader {
  constructor() {
    this.tsUrls = [];
    this.downloadedBlobs = [];
    this.progress = 0;
    this.total = 0;
    this.isCancelled = false;
    this.maxConcurrent = 6; // 最大并发下载数
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    // Master Playlist 相关
    this.isMasterPlaylist = false;
    this.subPlaylists = []; // 存储子播放列表信息
  }

  // 解析 m3u8 文件内容
  parseM3U8(content, baseUrl) {
    const lines = content.split('\n');
    const tsUrls = [];
    this.subPlaylists = [];
    this.isMasterPlaylist = false;
    let baseUri = '';

    // 提取 base URI
    try {
      const urlObj = new URL(baseUrl);
      const pathParts = urlObj.pathname.split('/');
      pathParts.pop(); // 移除文件名
      baseUri = urlObj.origin + pathParts.join('/');
    } catch (e) {
      baseUri = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
    }

    let currentBandwidth = 0;
    let currentResolution = '';
    let expectSegment = false; // 标记是否期望分片 URL（#EXTINF 后）

    for (let line of lines) {
      line = line.trim();
      
      // 跳过空行
      if (!line) continue;

      // 处理标签
      if (line.startsWith('#EXT')) {
        // 检测是否为 Master Playlist
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          this.isMasterPlaylist = true;
          // 解析带宽信息
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          if (bandwidthMatch) {
            currentBandwidth = parseInt(bandwidthMatch[1]);
          }
          // 解析分辨率（如果有）
          const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          if (resolutionMatch) {
            currentResolution = resolutionMatch[1];
          }
          expectSegment = false;
          continue;
        }
        
        // 检测 #EXTINF 标签（表示后面跟着分片 URL）
        if (line.startsWith('#EXTINF:')) {
          expectSegment = true;
          continue;
        }
        
        expectSegment = false;
        continue;
      }

      // 如果是 Master Playlist，提取子播放列表
      if (this.isMasterPlaylist) {
        let fullUrl = line;
        if (!line.startsWith('http://') && !line.startsWith('https://')) {
          if (line.startsWith('/')) {
            try {
              const urlObj = new URL(baseUrl);
              fullUrl = urlObj.origin + line;
            } catch (e) {
              fullUrl = baseUri + line;
            }
          } else {
            // 相对路径，需要保留 token 等参数
            fullUrl = baseUri + '/' + line;
          }
        }

        // 添加子播放列表信息
        this.subPlaylists.push({
          url: fullUrl,
          bandwidth: currentBandwidth,
          resolution: currentResolution,
          name: this.formatQualityName(currentBandwidth, currentResolution)
        });

        currentBandwidth = 0;
        currentResolution = '';
        continue;
      }

      // 普通 Media Playlist，提取 ts 分片（混合方案）
      // 策略：
      // 1. 如果是 #EXTINF 后的第一行，优先认为是分片 URL
      // 2. 检查扩展名（.ts, .m4s, .mp4 等）
      // 3. 检查是否为有效的 HTTP/HTTPS URL
      // 4. 通过 URL 特征辅助判断

      const isHttpUrl = line.startsWith('http://') || line.startsWith('https://');
      
      // 提取不带查询参数的 URL 用于扩展名检查
      const urlWithoutParams = line.split('?')[0];
      const hasVideoExtension = this.isVideoSegmentUrl(urlWithoutParams);
      
      // 混合判断逻辑
      if (expectSegment && isHttpUrl) {
        // #EXTINF 后的 HTTP URL，很可能是分片
        tsUrls.push(line);
        expectSegment = false;
      } else if (hasVideoExtension && isHttpUrl) {
        // 有视频扩展名的 HTTP URL
        tsUrls.push(line);
      } else if (hasVideoExtension && !isHttpUrl && !line.startsWith('/')) {
        // 有视频扩展名的相对路径
        let fullUrl = baseUri + '/' + line;
        tsUrls.push(fullUrl);
      } else if (!hasVideoExtension && !isHttpUrl && !line.startsWith('/')) {
        // 没有扩展名的相对路径
        let fullUrl = baseUri + '/' + line;
        const fullUrlWithoutParams = fullUrl.split('?')[0];
        if (this.isVideoSegmentUrl(fullUrlWithoutParams)) {
          tsUrls.push(fullUrl);
        } else if (expectSegment) {
          // #EXTINF 后的相对路径，也认为是分片
          tsUrls.push(fullUrl);
          expectSegment = false;
        }
      }
    }

    return tsUrls;
  }

  // 判断 URL 是否为视频分片（通过扩展名和特征）
  isVideoSegmentUrl(url) {
    // 扩展名白名单
    const videoExtensions = [
      '.ts',    // MPEG-TS
      '.m4s',   // DASH 分片
      '.mp4',   // MP4 分片
      '.m4v',   // M4V 分片
      '.tsv',   // TS 变体
      '.seg'    // 通用分片扩展
    ];
    
    // 检查扩展名
    for (const ext of videoExtensions) {
      if (url.endsWith(ext)) {
        return true;
      }
    }
    
    // 检查 URL 特征（某些平台使用无扩展名但有特定模式）
    const segmentPatterns = [
      '/segment',
      '/media',
      '/video',
      '/chunk',
      '/fragment',
      'playlist',
      'index'
    ];
    
    for (const pattern of segmentPatterns) {
      if (url.includes(pattern)) {
        return true;
      }
    }
    
    return false;
  }

  // 格式化清晰度名称
  formatQualityName(bandwidth, resolution) {
    const mbps = (bandwidth / 1000000).toFixed(1);
    if (resolution) {
      return `${resolution} (${mbps}Mbps)`;
    }
    return `${mbps}Mbps`;
  }

  // 下载单个 ts 分片
  async downloadTs(url, retryCount = 3) {
    for (let i = 0; i < retryCount; i++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        return blob;
      } catch (error) {
        console.warn(`下载失败 ${url}，重试 ${i + 1}/${retryCount}:`, error.message);
        if (i === retryCount - 1) {
          throw error;
        }
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // 批量下载 ts 分片（带并发控制）
  async downloadAllTs(tsUrls) {
    this.total = tsUrls.length;
    this.downloadedBlobs = new Array(this.total);
    this.isCancelled = false;

    const downloadQueue = [...tsUrls];
    const inProgress = new Map(); // url -> promise
    let completed = 0;

    return new Promise((resolve, reject) => {
      const downloadNext = async () => {
        if (this.isCancelled) {
          reject(new Error('用户取消下载'));
          return;
        }

        if (downloadQueue.length === 0 && inProgress.size === 0) {
          resolve();
          return;
        }

        // 启动新的下载任务，直到达到并发限制
        while (inProgress.size < this.maxConcurrent && downloadQueue.length > 0) {
          const url = downloadQueue.shift();
          const index = tsUrls.indexOf(url);

          const promise = this.downloadTs(url)
            .then(blob => {
              this.downloadedBlobs[index] = blob;
              completed++;
              this.progress = completed;

              // 更新进度
              if (this.onProgress) {
                this.onProgress({
                  current: completed,
                  total: this.total,
                  percentage: Math.round((completed / this.total) * 100)
                });
              }

              inProgress.delete(url);
              downloadNext();
            })
            .catch(error => {
              inProgress.delete(url);
              reject(error);
            });

          inProgress.set(url, promise);
        }
      };

      downloadNext();
    });
  }

  // 合并所有 ts 分片
  async mergeTsBlobs() {
    console.log('开始合并 ts 分片...');
    
    // 过滤掉空的 blob
    const validBlobs = this.downloadedBlobs.filter(blob => blob && blob.size > 0);
    
    if (validBlobs.length === 0) {
      throw new Error('没有有效的 ts 分片');
    }

    // 计算总大小
    const totalSize = validBlobs.reduce((sum, blob) => sum + blob.size, 0);
    console.log(`合并 ${validBlobs.length} 个分片，总大小：${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    // 创建最终的 blob
    const finalBlob = new Blob(validBlobs, { type: 'video/mp4' });
    
    return finalBlob;
  }

  // 主下载流程
  async download(url, fileName) {
    try {
      console.log('开始解析 m3u8:', url);
      
      // 1. 下载并解析 m3u8 文件
      const m3u8Response = await fetch(url);
      if (!m3u8Response.ok) {
        throw new Error('无法下载 m3u8 文件');
      }
      
      const m3u8Content = await m3u8Response.text();
      
      // 调试：打印 m3u8 文件内容
      console.log('m3u8 文件内容预览:');
      console.log(m3u8Content.substring(0, 1000));
      console.log('---');
      
      this.tsUrls = this.parseM3U8(m3u8Content, url);
      
      console.log(`解析到 ${this.tsUrls.length} 个 ts 分片`);
      
      // 检测是否为 Master Playlist
      if (this.isMasterPlaylist && this.subPlaylists.length > 0) {
        console.log('这是一个 Master Playlist，包含', this.subPlaylists.length, '个清晰度');
        // 需要用户选择清晰度
        throw new Error('MASTER_PLAYLIST');
      }
      
      if (this.tsUrls.length === 0) {
        throw new Error('m3u8 文件中没有找到 ts 分片');
      }

      // 2. 下载所有 ts 分片
      await this.downloadAllTs(this.tsUrls);
      
      if (this.isCancelled) {
        throw new Error('用户取消下载');
      }

      // 3. 合并 ts 分片
      const finalBlob = await this.mergeTsBlobs();
      
      console.log('合并完成，准备下载...');
      
      // 4. 触发下载
      const blobUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName.replace('.m3u8', '.mp4');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 清理
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      
      if (this.onComplete) {
        this.onComplete();
      }
      
      return true;
    } catch (error) {
      // 如果是 Master Playlist，不显示错误
      if (error.message !== 'MASTER_PLAYLIST') {
        console.error('m3u8 下载失败:', error);
        if (this.onError) {
          this.onError(error);
        }
      }
      throw error;
    }
  }

  // 下载选中的清晰度
  async downloadSelectedPlaylist(playlistUrl, fileName) {
    try {
      console.log('开始下载清晰度:', playlistUrl);
      
      // 1. 下载子 m3u8 文件
      const m3u8Response = await fetch(playlistUrl);
      if (!m3u8Response.ok) {
        throw new Error('无法下载 m3u8 文件');
      }
      
      const m3u8Content = await m3u8Response.text();
      
      // 调试：打印子 m3u8 文件内容
      console.log('子 m3u8 文件内容预览:');
      console.log(m3u8Content.substring(0, 1500));
      console.log('---');
      
      this.tsUrls = this.parseM3U8(m3u8Content, playlistUrl);
      
      console.log(`解析到 ${this.tsUrls.length} 个 ts 分片`);
      
      if (this.tsUrls.length === 0) {
        throw new Error('m3u8 文件中没有找到 ts 分片');
      }

      // 2. 下载所有 ts 分片
      await this.downloadAllTs(this.tsUrls);
      
      if (this.isCancelled) {
        throw new Error('用户取消下载');
      }

      // 3. 合并 ts 分片
      const finalBlob = await this.mergeTsBlobs();
      
      console.log('合并完成，准备下载...');
      
      // 4. 触发下载
      const blobUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName.replace('.m3u8', '.mp4');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 清理
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      
      if (this.onComplete) {
        this.onComplete();
      }
      
      return true;
    } catch (error) {
      console.error('子播放列表下载失败:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  // 取消下载
  cancel() {
    this.isCancelled = true;
    console.log('用户取消下载');
  }
}

// ==================== 悬浮控制器 ====================
class FloatingController {
  constructor() {
    this.btn = null;
    this.panel = null;
    this.videoResources = [];
    this.hls = null;
    this.artPlayerInstance = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.snapThreshold = 80;
    this.snapMargin = 20;
    this.btnSize = 64;
    this.isLeftSide = true;
    this.storageKey = 'videoFloatingBtnPosition';
    this.defaultPosition = { x: 20, y: null };
    this.currentPosition = this.loadPosition();
    this.init().catch(err => console.error('Floating init error:', err));
  }

  loadPosition() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const pos = JSON.parse(saved);
        const maxY = window.innerHeight - this.btnSize - this.snapMargin;
        pos.y = Math.max(this.snapMargin, Math.min(pos.y, maxY));
        this.isLeftSide = pos.x < window.innerWidth / 2;
        return pos;
      }
    } catch (e) {
      console.error('Load position error:', e);
    }
    return { ...this.defaultPosition, y: window.innerHeight - this.btnSize - this.snapMargin };
  }

  savePosition() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.currentPosition));
    } catch (e) {
      console.error('Save position error:', e);
    }
  }

  async init() {
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }
    this.createFloatingButton();
    this.createResourcePanel();
    this.listenResourceUpdates();
    this.applyPosition();
  }

  applyPosition() {
    const maxY = window.innerHeight - this.btnSize;
    const top = this.currentPosition.y !== null 
      ? this.currentPosition.y 
      : window.innerHeight - this.btnSize - this.snapMargin;
    
    this.btn.style.left = this.currentPosition.x + 'px';
    this.btn.style.top = Math.max(this.snapMargin, Math.min(top, maxY - this.snapMargin)) + 'px';
    this.btn.style.bottom = 'auto';
  }

  createFloatingButton() {
    if (document.getElementById('video-floating-btn')) return;
    this.btn = document.createElement('div');
    this.btn.id = 'video-floating-btn';
    this.btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
    document.body.appendChild(this.btn);

    this.btn.addEventListener('click', (e) => {
      if (!this.isDragging) {
        this.panel.classList.toggle('visible');
        if (this.panel.classList.contains('visible')) {
          this.updatePanelPosition();
        }
      }
    });

    this.initDragAndSnap();
  }

  updatePanelPosition() {
    const btnRect = this.btn.getBoundingClientRect();
    const panelWidth = 420;
    const panelHeight = this.panel.offsetHeight || 400;
    const gap = 10;
    const screenPadding = 20;
    
    const isLeft = this.currentPosition.x < window.innerWidth / 2;
    
    if (isLeft) {
      let left = btnRect.left;
      if (left + panelWidth > window.innerWidth - screenPadding) {
        left = window.innerWidth - panelWidth - screenPadding;
      }
      left = Math.max(screenPadding, left);
      this.panel.style.left = left + 'px';
      this.panel.style.right = 'auto';
    } else {
      let panelLeft = btnRect.right - panelWidth;
      if (panelLeft < screenPadding) {
        panelLeft = screenPadding;
      }
      panelLeft = Math.min(panelLeft, window.innerWidth - panelWidth - screenPadding);
      this.panel.style.left = panelLeft + 'px';
      this.panel.style.right = 'auto';
    }
    
    let bottom = window.innerHeight - btnRect.top + gap;
    if (bottom + panelHeight > window.innerHeight - screenPadding) {
      bottom = window.innerHeight - panelHeight - screenPadding;
      this.panel.style.bottom = bottom + 'px';
      this.panel.style.transformOrigin = isLeft ? 'left top' : 'right top';
    } else {
      this.panel.style.bottom = bottom + 'px';
      this.panel.style.transformOrigin = isLeft ? 'left bottom' : 'right bottom';
    }
  }

  initDragAndSnap() {
    const handleStart = (e) => {
      e.preventDefault();
      this.isDragging = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const rect = this.btn.getBoundingClientRect();
      this.dragOffset.x = clientX - rect.left;
      this.dragOffset.y = clientY - rect.top;
      
      this.btn.style.transition = 'none';
      this.btn.classList.add('dragging');
      
      const handleMove = (moveEvent) => {
        const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
        
        const newX = moveX - this.dragOffset.x;
        const newY = moveY - this.dragOffset.y;
        
        const deltaX = Math.abs(newX - this.currentPosition.x);
        const deltaY = Math.abs(newY - this.currentPosition.y);
        
        if (deltaX > 3 || deltaY > 3) {
          this.isDragging = true;
        }
        
        const maxX = window.innerWidth - this.btnSize;
        const maxY = window.innerHeight - this.btnSize;
        
        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(this.snapMargin, Math.min(newY, maxY - this.snapMargin));
        
        this.btn.style.left = clampedX + 'px';
        this.btn.style.top = clampedY + 'px';
      };
      
      const handleEnd = () => {
        this.btn.classList.remove('dragging');
        
        if (this.isDragging) {
          const rect = this.btn.getBoundingClientRect();
          const centerX = rect.left + this.btnSize / 2;
          const screenMiddle = window.innerWidth / 2;
          
          let snapX;
          if (centerX < screenMiddle) {
            this.isLeftSide = true;
            snapX = this.snapMargin;
          } else {
            this.isLeftSide = false;
            snapX = window.innerWidth - this.btnSize - this.snapMargin;
          }
          
          const snapY = Math.max(this.snapMargin, Math.min(rect.top, window.innerHeight - this.btnSize - this.snapMargin));
          this.currentPosition = { x: snapX, y: snapY };
          
          this.savePosition();
          
          this.btn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          this.btn.style.left = snapX + 'px';
          this.btn.style.top = snapY + 'px';
          
          setTimeout(() => {
            if (this.panel.classList.contains('visible')) {
              this.updatePanelPosition();
            }
          }, 300);
        }
        
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove, { passive: true });
      document.addEventListener('touchend', handleEnd);
    };
    
    this.btn.addEventListener('mousedown', handleStart);
    this.btn.addEventListener('touchstart', handleStart, { passive: true });
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
        
        // 移除其他项的选中状态
        listContainer.querySelectorAll('.resource-item').forEach(i => {
          i.classList.remove('selected');
        });
        
        // 添加当前项的选中状态
        item.classList.add('selected');
        
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

  showDownloadError(message) {
    const tip = document.createElement('div');
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(231, 76, 60, 0.9);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    tip.textContent = message;
    document.body.appendChild(tip);
    setTimeout(() => document.body.removeChild(tip), 3000);
  }

  showDownloadSuccess(fileName) {
    const tip = document.createElement('div');
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 188, 156, 0.9);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    tip.textContent = '开始下载：' + fileName;
    document.body.appendChild(tip);
    setTimeout(() => document.body.removeChild(tip), 2000);
  }

  downloadResource(url) {
    const fileName = this.getFileNameFromUrl(url);
    
    console.log('开始下载:', url, '文件名:', fileName);
    
    // 检测是否为 m3u8 文件
    const isM3U8 = url.includes('.m3u8') || url.includes('m3u8');
    
    if (isM3U8) {
      // 使用 M3U8Downloader 完整下载视频流
      this.downloadM3U8(url, fileName);
    } else {
      // 普通文件使用 Chrome Downloads API
      if (chrome.downloads) {
        chrome.downloads.download({
          url: url,
          filename: fileName,
          saveAs: false,
          conflictAction: 'overwrite'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Downloads API 失败:', chrome.runtime.lastError);
            this.showDownloadError('下载失败：' + chrome.runtime.lastError.message);
          } else {
            console.log('Downloads API 成功，ID:', downloadId);
            this.showDownloadSuccess(fileName);
          }
        });
      } else {
        this.downloadWithFetch(url, fileName);
      }
    }
  }

  // 下载 m3u8 视频流
  async downloadM3U8(url, fileName) {
    const downloader = new M3U8Downloader();
    
    // 显示进度提示
    const progressTip = this.createProgressTip();
    
    downloader.onProgress = (progress) => {
      progressTip.querySelector('.progress-text').textContent = 
        `正在下载：${progress.current}/${progress.total} (${progress.percentage}%)`;
      progressTip.querySelector('.progress-bar').style.width = progress.percentage + '%';
    };
    
    downloader.onComplete = () => {
      progressTip.remove();
      this.showDownloadSuccess(fileName.replace('.m3u8', '.mp4'));
    };
    
    downloader.onError = (error) => {
      progressTip.remove();
      this.showDownloadError('下载失败：' + error.message);
    };
    
    try {
      await downloader.download(url, fileName);
    } catch (error) {
      // 如果是 Master Playlist，显示清晰度选择
      if (error.message === 'MASTER_PLAYLIST') {
        this.showQualitySelector(downloader, url, fileName, progressTip);
      } else {
        console.error('M3U8 下载失败:', error);
      }
    }
  }

  // 显示清晰度选择器
  showQualitySelector(downloader, url, fileName, progressTip) {
    const subPlaylists = downloader.subPlaylists;
    
    // 创建选择对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10002;
      backdrop-filter: blur(5px);
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      border-radius: 16px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;
    
    const title = document.createElement('h3');
    title.textContent = '选择视频清晰度';
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #2c3e50;
      font-size: 20px;
      font-weight: 600;
    `;
    
    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 400px;
      overflow-y: auto;
    `;
    
    // 添加清晰度选项
    subPlaylists.forEach((playlist, index) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 15px 20px;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      item.onmouseover = () => {
        item.style.borderColor = '#3498db';
        item.style.background = '#f0f8ff';
      };
      
      item.onmouseout = () => {
        item.style.borderColor = '#e0e0e0';
        item.style.background = 'white';
      };
      
      const name = document.createElement('span');
      name.textContent = playlist.name;
      name.style.cssText = `
        font-weight: 600;
        color: #2c3e50;
      `;
      
      const bandwidth = document.createElement('span');
      bandwidth.textContent = `${(playlist.bandwidth / 1000).toFixed(0)} Kbps`;
      bandwidth.style.cssText = `
        color: #7f8c8d;
        font-size: 14px;
      `;
      
      item.appendChild(name);
      item.appendChild(bandwidth);
      
      item.onclick = () => {
        dialog.remove();
        progressTip.remove();
        
        // 创建新的进度提示
        const newProgressTip = this.createProgressTip();
        downloader.onProgress = (progress) => {
          newProgressTip.querySelector('.progress-text').textContent = 
            `正在下载：${progress.current}/${progress.total} (${progress.percentage}%)`;
          newProgressTip.querySelector('.progress-bar').style.width = progress.percentage + '%';
        };
        downloader.onComplete = () => {
          newProgressTip.remove();
          this.showDownloadSuccess(fileName.replace('.m3u8', '.mp4'));
        };
        downloader.onError = (error) => {
          newProgressTip.remove();
          this.showDownloadError('下载失败：' + error.message);
        };
        
        downloader.downloadSelectedPlaylist(playlist.url, fileName);
      };
      
      list.appendChild(item);
    });
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
      margin-top: 20px;
      padding: 12px 30px;
      background: #e0e0e0;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.3s;
    `;
    
    cancelBtn.onmouseover = () => {
      cancelBtn.style.background = '#d0d0d0';
    };
    
    cancelBtn.onmouseout = () => {
      cancelBtn.style.background = '#e0e0e0';
    };
    
    cancelBtn.onclick = () => {
      dialog.remove();
      progressTip.remove();
    };
    
    content.appendChild(title);
    content.appendChild(list);
    content.appendChild(cancelBtn);
    dialog.appendChild(content);
    document.body.appendChild(dialog);
  }

  // 创建进度提示框
  createProgressTip() {
    const tip = document.createElement('div');
    tip.style.cssText = `
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(52, 152, 219, 0.95);
      color: white;
      padding: 15px 30px;
      border-radius: 12px;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      min-width: 300px;
      backdrop-filter: blur(10px);
    `;
    
    tip.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: bold;">正在下载 HLS 视频流...</div>
      <div class="progress-text" style="margin-bottom: 8px;">正在解析 m3u8...</div>
      <div style="background: rgba(255,255,255,0.3); border-radius: 6px; overflow: hidden; height: 8px;">
        <div class="progress-bar" style="background: linear-gradient(90deg, #3498db, #2ecc71); width: 0%; height: 100%; transition: width 0.3s;"></div>
      </div>
      <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">请勿关闭页面</div>
    `;
    
    document.body.appendChild(tip);
    return tip;
  }

  // 使用 fetch + blob 方式下载（处理同源或 CORS 允许的资源）
  async downloadWithFetch(url, fileName) {
    try {
      console.log('使用 fetch 下载:', url);
      
      // 使用 blob 模式，但添加一些优化
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // 获取 Content-Type
      const contentType = response.headers.get('Content-Type') || '';
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      // 尝试设置正确的 MIME 类型
      a.type = contentType;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 延迟清理 blob URL，确保下载已开始
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        console.log('Blob URL 已清理');
      }, 1000);
      
      console.log('Fetch 下载成功:', fileName);
      this.showDownloadSuccess(fileName);
    } catch (error) {
      console.error('Fetch 下载失败:', error);
      this.showDownloadError('下载失败：' + error.message + '，可能是跨域限制');
    }
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
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      let fileName = pathname.split('/').pop() || 'video-file';
      
      // 移除查询参数
      fileName = fileName.split('?')[0];
      
      // 如果文件名过长或无效，使用默认名
      if (!fileName || fileName.length > 200) {
        fileName = 'video-' + Date.now();
      }
      
      return fileName;
    } catch (e) { 
      return 'video-file-' + Date.now(); 
    }
  }
}

(() => {
  if (window !== window.top) return;
  new FloatingController();
})();
