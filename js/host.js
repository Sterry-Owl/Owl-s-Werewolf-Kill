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