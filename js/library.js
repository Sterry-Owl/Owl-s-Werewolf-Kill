// ==================== 圖書管理員與 GitHub API 邏輯 ====================

/**
 * 系統啟動或主持人建立房間時，讀取 GitHub 上的 cards.json
 * @returns {Promise<Array>} 傳回卡牌陣列，若失敗則傳回空陣列
 */
async function loadCardsLibrary() {
    try {
        // 加上時間戳記避免瀏覽器快取舊資料
        const res = await fetch('cards.json?t=' + Date.now());
        if (!res.ok) throw new Error('File not found');
        const data = await res.json();
        // 初始化每張卡牌的選取數量為 0
        return data.map(card => ({ ...card, qty: 0 }));
    } catch (error) {
        return []; 
    }
}

/**
 * 儲存 GitHub 連線設定並測試讀取遠端牌庫
 */
async function saveGitHubAuth() {
    const user = document.getElementById('gh-user').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    const token = document.getElementById('gh-token').value.trim();
    
    if(!user || !repo || !token) return alert('請填寫完整 GitHub 資訊');
    
    // 將授權資訊存入瀏覽器 LocalStorage
    localStorage.setItem('gh_user', user);
    localStorage.setItem('gh_repo', repo);
    localStorage.setItem('gh_token', token);
    
    document.getElementById('gh-status').innerText = '設定已儲存，正在從 GitHub 抓取最新牌庫...';
    document.getElementById('btn-add-card').disabled = true;
    document.getElementById('btn-sync').disabled = true;
    
    try {
        const res = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/cards.json`, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if(res.ok) {
            const data = await res.json();
            // 解碼 Base64 內容並處理中文字元
            const content = decodeURIComponent(escape(atob(data.content)));
            
            try {
                library = JSON.parse(content);
                if (!Array.isArray(library)) library = [];
            } catch(e) {
                library = [];
            }