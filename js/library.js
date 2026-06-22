// ==================== 圖書管理員與 GitHub API 邏輯 ====================

async function loadCardsLibrary() {
    try {
        const res = await fetch('cards.json?t=' + Date.now());
        if (!res.ok) throw new Error('File not found');
        const data = await res.json();
        return data.map(card => ({ ...card, qty: 0 }));
    } catch (error) {
        return []; 
    }
}

async function saveGitHubAuth() {
    const user = document.getElementById('gh-user').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    const token = document.getElementById('gh-token').value.trim();
    
    if(!user || !repo || !token) return alert('請填寫完整 GitHub 資訊');
    
    localStorage.setItem('gh_user', user);
    localStorage.setItem('gh_repo', repo);
    localStorage.setItem('gh_token', token);
    
    document.getElementById('gh-status').innerText = '設定已儲存，正在從 GitHub 抓取最新牌庫...';
    document.getElementById('btn-sync').disabled = false;
    
    await fetchLibraryFromGitHub();
}

let library = [];

async function fetchLibraryFromGitHub() {
    const user = localStorage.getItem('gh_user');
    const repo = localStorage.getItem('gh_repo');
    const token = localStorage.getItem('gh_token');
    if(!user || !repo || !token) return;

    try {
        const res = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/cards.json`, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('gh_file_sha', data.sha); 
            const decodedContent = decodeURIComponent(escape(atob(data.content)));
            library = JSON.parse(decodedContent);
        } else {
            library = [];
        }
        localStorage.setItem('werewolf_library', JSON.stringify(library));
        document.getElementById('btn-add-card').disabled = false;
        document.getElementById('btn-add-card').innerText = '加入 / 更新卡牌';
        document.getElementById('gh-status').innerText = '牌庫讀取成功！';
        renderLibraryTable();
    } catch (error) {
        document.getElementById('gh-status').innerText = '讀取失敗，請確認資料夾中是否存在 cards.json';
    }
}

function selectFaction(faction, btn) {
    document.getElementById('lib-card-faction').value = faction;
    document.querySelectorAll('.faction-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.style.borderColor = 'var(--accent-blue)';
}

function addCardToLibrary() {
    const name = document.getElementById('lib-card-name').value.trim();
    const faction = document.getElementById('lib-card-faction').value;
    const imgName = document.getElementById('lib-card-img').value.trim();
    
    if (!name) return alert('請輸入卡牌名稱');

    const newCard = {
        id: 'card_' + Date.now(),
        name: name,
        faction: faction,
        img: imgName ? `./img/${imgName}` : ''
    };

    const existingIndex = library.findIndex(c => c.name === name);
    if (existingIndex >= 0) {
        library[existingIndex] = newCard;
    } else {
        library.push(newCard);
    }

    localStorage.setItem('werewolf_library', JSON.stringify(library));
    renderLibraryTable();
    
    document.getElementById('lib-card-name').value = '';
    document.getElementById('lib-card-img').value = '';
}

function removeCardFromLibrary(id) {
    library = library.filter(c => c.id !== id);
    localStorage.setItem('werewolf_library', JSON.stringify(library));
    renderLibraryTable();
}

function renderLibraryTable() {
    const table = document.getElementById('lib-table');
    table.innerHTML = '<tr><th>圖片預覽</th><th>名稱</th><th>陣營</th><th>操作</th></tr>';
    
    library.forEach(card => {
        table.innerHTML += `<tr>
            <td><img src="${card.img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;background:#222;" onerror="this.style.display='none'"></td>
            <td>${card.name}</td>
            <td><span class="badge" style="background:${card.faction === '好人陣營' ? 'var(--accent-blue)' : card.faction === '狼人陣營' ? 'var(--accent-red)' : '#888'}">${card.faction}</span></td>
            <td><button onclick="removeCardFromLibrary('${card.id}')" style="background:var(--accent-red); padding:6px 12px;">刪除</button></td>
        </tr>`;
    });
}

function utoa(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

async function syncToGitHub() {
    const user = localStorage.getItem('gh_user');
    const repo = localStorage.getItem('gh_repo');
    const token = localStorage.getItem('gh_token');
    const sha = localStorage.getItem('gh_file_sha');

    if(!user || !repo || !token) return alert('請先設定上方系統連線。');
    
    const btn = document.getElementById('btn-sync');
    btn.innerText = '🔄 同步中，請稍候...';
    btn.disabled = true;

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
            alert('✅ 成功同步至 GitHub！');
        } else {
            alert('❌ 同步失敗。');
        }
    } catch (e) {
        alert('❌ 發生錯誤。');
    }
    btn.innerText = '☁️ 將目前清單同步至 GitHub 伺服器';
    btn.disabled = false;
}