// ==================== 介面控制與版面渲染邏輯 ====================

/**
 * 顯示圖書管理員介面並檢查本機連線紀錄
 */
function showLibrarian() {
    document.getElementById('role-selection').classList.add('hidden');
    document.getElementById('librarian-section').classList.remove('hidden');
    
    const ghUser = localStorage.getItem('gh_user');
    const ghRepo = localStorage.getItem('gh_repo');
    const ghToken = localStorage.getItem('gh_token');
    
    if(ghUser && ghRepo && ghToken) {
        document.getElementById('gh-user').value = ghUser;
        document.getElementById('gh-repo').value = ghRepo;
        document.getElementById('gh-token').value = ghToken;
        saveGitHubAuth(); 
    } else {
        document.getElementById('btn-add-card').innerText = '請先完成連線設定';
        document.getElementById('gh-status').innerText = '無連線紀錄，請輸入資訊並點擊上方按鈕。';
    }
}

/**
 * 處理圖書管理員介面的陣營按鈕點擊與視覺切換
 */
function selectFaction(factionName, btnElement) {
    document.getElementById('lib-card-faction').value = factionName;
    const buttons = document.querySelectorAll('.faction-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#444';
    });
    btnElement.classList.add('active');
    btnElement.style.background = 'var(--accent-blue)';
}

/**
 * 顯示玩家加入房間介面
 */
function showPlayerJoin() {
    document.getElementById('role-selection').classList.add('hidden');
    document.getElementById('player-join-section').classList.remove('hidden');
}

/**
 * 渲染主持人視角的圓形座位表
 */
function renderHostCircle() {
    const container = document.getElementById('host-circle-container');
    container.innerHTML = '';
    if(players.length === 0) return;
    
    const radius = 140; // 座位環繞半徑
    const center = 175; // 容器中心點 (350 / 2)
    
    players.forEach((p, i) => {
        // 三角函數計算環狀座標 (從正上方 -90 度開始排)
        const angle = (i / players.length) * 2 * Math.PI - (Math.PI / 2);
        const x = center + radius * Math.cos(angle) - 30; // -30 為扣除元素本身一半的寬度
        const y = center + radius * Math.sin(angle) - 30;
        
        const seatDiv = document.createElement('div');
        seatDiv.className = 'seat';
        seatDiv.style.left = `${x}px`; 
        seatDiv.style.top = `${y}px`;
        
        let roleHtml = p.card ? `<div class="role-label">${p.card.name}</div>` : '';
        const shortName = p.name.length > 4 ? p.name.substring(0,4) + '..' : p.name;
        
        seatDiv.innerHTML = `${roleHtml}<span class="seat-num">${p.seat}</span><span>${shortName}</span>`;
        container.appendChild(seatDiv);
    });
}

/**
 * 渲染玩家視角的圓形座位表
 * @param {Array} playersList - 接收自主持人廣播的玩家清單
 */
function renderPlayerCircle(playersList) {
    const container = document.getElementById('player-circle-container');
    const centerView = container.querySelector('.center-card-view');
    
    // 清空並重新加入中央專屬視角區塊
    container.innerHTML = '';
    container.appendChild(centerView);
    
    if(playersList.length === 0) return;
    
    const radius = 170; // 玩家介面座位環繞半徑
    const center = 200; // 容器中心點 (400 / 2)
    
    playersList.forEach((p, i) => {
        const angle = (i / playersList.length) * 2 * Math.PI - (Math.PI / 2);
        const x = center + radius * Math.cos(angle) - 30; 
        const y = center + radius * Math.sin(angle) - 30;
        
        const seatDiv = document.createElement('div');
        seatDiv.className = 'seat';
        
        // 若為本機玩家，套用高亮綠色樣式
        if (p.id === myPeerId) seatDiv.classList.add('is-me');
        
        seatDiv.style.left = `${x}px`; 
        seatDiv.style.top = `${y}px`;
        
        const shortName = p.name.length > 4 ? p.name.substring(0,4) + '..' : p.name;
        seatDiv.innerHTML = `<span class="seat-num">${p.seat}</span><span>${shortName}</span>`;
        container.appendChild(seatDiv);
    });
}