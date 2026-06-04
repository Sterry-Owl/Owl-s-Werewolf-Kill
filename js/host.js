// ==================== 主持人邏輯與遊戲控制 ====================

/**
 * 初始化主持人介面與建立 PeerJS 房間
 */
async function initHost() {
    document.getElementById('role-selection').classList.add('hidden');
    
    // 載入全局牌庫
    roomConfig = await loadCardsLibrary();
    if (roomConfig.length === 0) {
        alert('系統尚未建立牌庫。請先以「圖書管理員」身分登入並同步資料至 GitHub。');
        location.reload();
        return;
    }

    document.getElementById('host-dashboard').classList.remove('hidden');
    renderHostConfigGallery();
    
    // 隨機產生 4 碼房號
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = 'ROOM-' + roomCode;
    peer = new Peer(peerId, peerConfig);
    
    peer.on('open', (id) => {
        document.getElementById('room-code-display').innerText = roomCode;
    });

    // 監聽玩家連線
    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'JOIN') {
                // 新增玩家資料
                players.push({ id: conn.peer, name: data.name, card: null, seat: nextSeatNumber++ });
                connections[conn.peer] = conn;
                
                // 更新主持人畫面與廣播最新資訊
                renderHostCircle();
                conn.send({ type: 'CONFIG', config: roomConfig });
                broadcastPlayerList(); 
            }
        });
        conn.on('close', () => {
            // 玩家斷線時移除資料
            players = players.filter(p => p.id !== conn.peer);
            delete connections[conn.peer];
            renderHostCircle();
            broadcastPlayerList(); 
        });
    });
}

/**
 * 渲染主持人視角的本局牌庫配置表單
 */
function renderHostConfigGallery() {
    const gallery = document.getElementById('host-config-gallery');
    gallery.innerHTML = '';
    let total = 0;
    
    roomConfig.forEach((card, index) => {
        total += card.qty;
        const imgSrc = card.img || defaultSvg;
        gallery.innerHTML += `
            <div class="config-card">
                <img src="${imgSrc}" alt="${card.name}">
                <div style="font-size:14px; font-weight:bold;">${card.name}</div>
                <div style="font-size:11px; color:#aaa;">${card.faction || '無陣營'}</div>
                <input type="number" min="0" value="${card.qty}" onchange="updateCardQty(${index}, this.value)" ${isGameDealt ? 'disabled' : ''}>
            </div>
        `;
    });
    document.getElementById('host-total-cards').innerText = total;
}

/**
 * 更新指定卡牌的數量
 * @param {number} index - 卡牌在陣列中的索引
 * @param {string} value - 輸入的新數量
 */
function updateCardQty(index, value) {
    if (isGameDealt) return;
    roomConfig[index].qty = parseInt(value) || 0;
    
    // 重新計算總數
    let total = roomConfig.reduce((sum, card) => sum + card.qty, 0);
    document.getElementById('host-total-cards').innerText = total;
    
    // 即時廣播給所有玩家
    broadcastConfig();
}

/**
 * 將當前牌庫配置廣播給所有已連線的玩家
 */
function broadcastConfig() { 
    Object.values(connections).forEach(conn => conn.send({ type: 'CONFIG', config: roomConfig })); 
}

/**
 * 將當前玩家名單廣播給所有已連線的玩家 (去除敏感的卡牌資訊)
 */
function broadcastPlayerList() {
    const safeList = players.map(p => ({ id: p.id, name: p.name, seat: p.seat }));
    Object.values(connections).forEach(conn => conn.send({ type: 'PLAYERS_UPDATE', list: safeList }));
}

/**
 * 執行發牌邏輯：洗牌並派發給各連線玩家
 */
function dealCards() {
    if (players.length === 0) return alert('沒有玩家加入房間');
    
    // 依據配置數量建立完整的卡牌陣列 (Deck)
    fullDeck = [];
    roomConfig.forEach(c => { 
        for(let i=0; i<c.qty; i++) fullDeck.push({ name: c.name, faction: c.faction, img: c.img }); 
    });
    
    if (fullDeck.length < players.length) return alert('卡牌總數少於玩家人數！');

    // Fisher-Yates 洗牌演算法
    for (let i = fullDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
    }

    // 依序派發卡牌
    players.forEach(p => {
        const dealtCard = fullDeck.pop();
        p.card = dealtCard;
        if (connections[p.id]) connections[p.id].send({ type: 'DEAL', card: dealtCard });
    });
    
    // 鎖定介面狀態
    isGameDealt = true;
    document.getElementById('config-status-text').innerText = '(已鎖定)';
    document.getElementById('config-status-text').style.color = 'var(--accent-red)';
    document.getElementById('btn-deal').style.display = 'none';
    document.getElementById('btn-reset').style.display = 'inline-block';
    
    renderHostConfigGallery();
    renderHostCircle();
}

/**
 * 重置遊戲：收回所有玩家卡牌並解鎖配置表單
 */
function resetGame() {
    // 清空伺服器端紀錄的玩家手牌
    players.forEach(p => p.card = null);
    
    // 通知所有玩家重置介面
    Object.values(connections).forEach(conn => conn.send({ type: 'RESET' }));
    
    // 解鎖介面狀態
    isGameDealt = false;
    document.getElementById('config-status-text').innerText = '(可修改)';
    document.getElementById('config-status-text').style.color = 'var(--accent-green)';
    document.getElementById('btn-deal').style.display = 'inline-block';
    document.getElementById('btn-reset').style.display = 'none';
    
    renderHostConfigGallery();
    renderHostCircle();
}