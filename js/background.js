// 存储检测到的视频资源（按标签页ID分类）
const videoResources = new Map();

// 视频MIME类型白名单（补充常见格式）
const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
  'video/x-flv', 'video/webm', 'application/x-mpegurl', 'application/vnd.apple.mpegurl'
]);


const VIDEO_EXTENSIONS = new Set(['mp4', 'm3u8', 'webm', 'mov', 'flv', 'avi', 'mkv', 'ts']);

// 拦截网络请求，检测视频资源
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { tabId, url, responseHeaders, type } = details;
    if (tabId === -1) return;  // 忽略非标签页请求

    // 从响应头获取MIME类型
    const contentTypeHeader = responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
    const mimeType = contentTypeHeader?.value?.split(';')[0] || '';

    // 从URL提取扩展名
    const urlObj = new URL(url);
    const ext = urlObj.pathname.split('.').pop()?.toLowerCase() || '';

    // 双重验证：MIME类型或扩展名匹配视频格式
    const isVideo = VIDEO_MIME_TYPES.has(mimeType) || VIDEO_EXTENSIONS.has(ext);
    if (!isVideo) return;

    // 获取文件大小
    const contentLengthHeader = responseHeaders?.find(h => h.name.toLowerCase() === 'content-length');
    const size = contentLengthHeader ? parseInt(contentLengthHeader.value) : 0;

    // 存储资源（按tabId分组）
    if (!videoResources.has(tabId)) {
      videoResources.set(tabId, []);
    }
    const resources = videoResources.get(tabId);
    if (!resources.some(r => r.url === url)) {
      const newResource = { url, type: mimeType, size };
      resources.push(newResource);
      // 主动通知当前标签页的content-script
      chrome.tabs.sendMessage(tabId, {
        type: 'NEW_VIDEO_RESOURCE',
        resource: newResource
      }).catch(() => {});  // 忽略标签页未加载完成的错误
    }
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest', 'media', 'other', 'script'] },  // 扩展类型
  ['responseHeaders', 'extraHeaders']  // 确保能获取完整响应头
);

// 监听标签页关闭，清理资源
chrome.tabs.onRemoved.addListener((tabId) => {
  videoResources.delete(tabId);
});

// 响应content-script的资源请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_VIDEO_RESOURCES' && sender.tab?.id) {
    sendResponse({ resources: videoResources.get(sender.tab.id) || [] });
  }
});