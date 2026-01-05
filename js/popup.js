// popup.js
console.log('🔥 popup.js loaded');

document.addEventListener('DOMContentLoaded', async () => {
    const pauseThisTabImg = document.getElementById('pause-this-tab');
    const pauseAllTabsImg = document.getElementById('pause-all-tabs');

    // 获取当前标签页 ID 和 全局状态
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url).hostname;

    chrome.storage.local.get(['pausedHosts', 'isPausedAll'], (data) => {
        const pausedHosts = data.pausedHosts || [];
        pauseThisTabImg.checked = pausedHosts.includes(url);
        pauseAllTabsImg.checked = !!data.isPausedAll;
    });

    // 切换“在此页面暂停”
    pauseThisTabImg.onchange = () => {
        chrome.storage.local.get(['pausedHosts'], (data) => {
            let pausedHosts = data.pausedHosts || [];
            if (pauseThisTabImg.checked) {
                if (!pausedHosts.includes(url)) pausedHosts.push(url);
            } else {
                pausedHosts = pausedHosts.filter(h => h !== url);
            }
            chrome.storage.local.set({ pausedHosts }, () => {
                chrome.tabs.reload(tab.id); 
            });
        });
    };

    // 切换“全局暂停”
    pauseAllTabsImg.onchange = () => {
        chrome.storage.local.set({ isPausedAll: pauseAllTabsImg.checked }, () => {
            chrome.runtime.sendMessage({ type: 'STATE_CHANGED' });
        });
    };
});