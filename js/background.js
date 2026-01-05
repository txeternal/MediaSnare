// ================== 资源存储（按 tabId 分组） ==================
const videoResources = new Map();

// ================== MIME & 扩展名 ==================
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-flv',
  'video/mpeg'
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'mov', 'avi', 'flv', 'mkv'
]);

// ================== 请求拦截 ==================
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { tabId, url, responseHeaders } = details;
    if (tabId === -1) return;

    let mimeType = '';
    let size = 0;

    for (const h of responseHeaders || []) {
      const name = h.name.toLowerCase();
      if (name === 'content-type') {
        mimeType = h.value.split(';')[0];
      }
      if (name === 'content-length') {
        size = parseInt(h.value, 10) || 0;
      }
    }

    let ext = '';
    try {
      ext = new URL(url).pathname.split('.').pop().toLowerCase();
    } catch {
      return;
    }

    // ================== 类型判断 ==================
    const isM3U8 =
      ext === 'm3u8' ||
      mimeType === 'application/x-mpegurl' ||
      mimeType === 'application/vnd.apple.mpegurl';

    const isTS =
      ext === 'ts' ||
      mimeType === 'video/mp2t';

    const isNormalVideo =
      !isM3U8 &&
      !isTS &&
      (VIDEO_MIME_TYPES.has(mimeType) || VIDEO_EXTENSIONS.has(ext));

    // ================== ts：直接忽略 ==================
    if (isTS) {
      return;
    }

    if (!videoResources.has(tabId)) {
      videoResources.set(tabId, []);
    }

    const resources = videoResources.get(tabId);

    // ================== m3u8：单独标记 ==================
    if (isM3U8) {
      if (resources.some(r => r.isM3U8 && r.url === url)) return;

      const resource = {
        url,
        ext: 'm3u8',
        mimeType,
        size: 0,
        isM3U8: true,
        category: 'hls'
      };

      resources.push(resource);

      chrome.tabs.sendMessage(tabId, {
        type: 'NEW_VIDEO_RESOURCE',
        resource
      }).catch(() => {});
      return;
    }

    // ================== 普通视频 ==================
    if (isNormalVideo) {
      if (resources.some(r => r.url === url)) return;

      const resource = {
        url,
        ext,
        mimeType,
        size,
        isM3U8: false,
        category: 'file'
      };

      resources.push(resource);

      chrome.tabs.sendMessage(tabId, {
        type: 'NEW_VIDEO_RESOURCE',
        resource
      }).catch(() => {});
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

// ================== tab 关闭清理 ==================
chrome.tabs.onRemoved.addListener((tabId) => {
  videoResources.delete(tabId);
});

// ================== content-script 主动请求 ==================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_VIDEO_RESOURCES' && sender.tab?.id !== undefined) {
    sendResponse({
      resources: videoResources.get(sender.tab.id) || []
    });
  }
});
