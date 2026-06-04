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
            
            localStorage.setItem('gh_file_sha', data.sha); 
            document.getElementById('gh-status').innerText = '✅ 成功抓取最新牌庫！';
            unlockLibrarianButtons();
        } else if (res.status === 404) {
            library = [];
            localStorage.removeItem('gh_file_sha');
            document.getElementById('gh-status').innerText = '⚠️ 儲存庫尚無 cards.json，新增卡牌並同步將建立該檔案。';
            unlockLibrarianButtons();
        } else {
            throw new Error('API 拒絕存取，請檢查 Token 權限。');
        }
        renderLibraryTable();
    } catch (err) {
        library = [];
        document.getElementById('gh-status').innerText = '⚠️ 讀取異常 (' + err.message + ')。已切換為強制覆寫模式，可直接新增並同步。';
        unlockLibrarianButtons();
    }
}

/**
 * 解鎖圖書管理員介面的操作按鈕
 */
function unlockLibrarianButtons() {
    const btnAdd = document.getElementById('btn-add-card');
    const btnSync = document.getElementById('btn-sync');
    btnAdd.disabled = false;
    btnAdd.innerText = '新增至下方清單';
    btnSync.disabled = false;
}

/**
 * 將新卡牌資料加入本機陣列
 */
function addCardToLibrary() {
    const name = document.getElementById('lib-card-name').value.trim();
    const faction = document.getElementById('lib-card-faction').value.trim();
    const imgFileName = document.getElementById('lib-card-img').value.trim();
    
    if (!name) return alert('請輸入卡牌名稱');
    
    let imgPath = '';
    if (imgFileName) {
        imgPath = `./img/${imgFileName}`;
    }

    library.push({ id: Date.now().toString(), name, faction, img: imgPath });
    
    document.getElementById('lib-card-name').value = '';
    document.getElementById('lib-card-img').value = '';
    renderLibraryTable();
}

/**
 * 從本機陣列刪除指定卡牌
 * @param {string} id - 卡牌的唯一識別碼
 */
function removeCardFromLibrary(id) {
    library = library.filter(c => c.id !== id);
    renderLibraryTable();
}

/**
 * 渲染圖書管理員下方的卡牌資料表
 */
function renderLibraryTable() {
    const table = document.getElementById('lib-table');
    table.innerHTML = '<tr><th>圖片預覽</th><th>名稱</th><th>陣營</th><th>操作</th></tr>';
    library.forEach(card => {
        const imgTag = card.img ? `<img src="${card.img}" style="max-height:40px; border-radius:4px;" alt="找不到圖片">` : '-';
        table.innerHTML += `<tr>
            <td style="text-align:center;">${imgTag}</td>
            <td>${card.name}</td>
            <td><span class="badge">${card.faction || '無'}</span></td>
            <td><button onclick="removeCardFromLibrary('${card.id}')" style="background:var(--accent-red); padding:6px 12px;">刪除</button></td>
        </tr>`;
    });
}

/**
 * 將本機卡牌陣列轉換為 JSON 並同步至 GitHub
 */
async function syncToGitHub() {
    const user = localStorage.getItem('gh_user');
    const repo = localStorage.getItem('gh_repo');
    const token = localStorage.getItem('gh_token');
    const sha = localStorage.getItem('gh_file_sha');

    if(!user || !repo || !token) return alert('請先設定上方系統連線。');
    
    const btn = document.getElementById('btn-sync');
    btn.innerText = '🔄 同步中，請稍候...';
    btn.disabled = true;

    // 將資料轉為格式化的 JSON 字串並進行 Base64 編碼
    const contentBase64 = utoa(JSON.stringify(library, null, 2));
    const body = { message: '更新牌庫設定 (採用路徑對應)', content: contentBase64 };
    if (sha) body.sha = sha;

    try {
        const res = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/cards.json`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const result = await res.json();
            localStorage.setItem('gh_file_sha', result.content.sha); 
            alert('✅ 牌庫已成功同步至 GitHub！');
        } else {
            throw new Error('同步失敗，可能權限不足或檔案衝突。');
        }
    } catch (err) {
        alert('錯誤：' + err.message);
    } finally {
        btn.innerText = '☁️ 將目前清單同步至 GitHub 伺服器';
        btn.disabled = false;
    }
}