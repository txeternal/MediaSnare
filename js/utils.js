// 格式化文件大小（字节转人类可读格式）
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 检测是否为视频资源
function isVideoResource(url) {
  const videoExts = ['mp4', 'm3u8', 'webm', 'mov', 'flv', 'avi', 'mkv'];
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  return videoExts.includes(ext);
}

// 提取URL中的文件名
function getFileNameFromUrl(url) {
  const path = new URL(url).pathname;
  return path.split('/').pop() || 'unknown-video';
}

// 暴露到全局，供其他脚本调用
window.formatFileSize = formatFileSize;
window.isVideoResource = isVideoResource;
window.getFileNameFromUrl = getFileNameFromUrl;