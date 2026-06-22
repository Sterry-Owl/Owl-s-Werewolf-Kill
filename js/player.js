// ==========================================
// v3.0 玩家終端層 (Dumb Client)
// ==========================================

let playerPeer = null;
let hostConnection = null;
let localState = null;
let selectedTargets = [];
let specialValue = null;

window.initPlayer = function(roomId, playerName) {
    playerPeer = new Peer(PEER_CONFIG);
    
    playerPeer.on('open', (id) => {
        UI.updateStatusMessage('正在連線至房間...');
        hostConnection = playerPeer.connect(roomId);
        
        hostConnection.on('open', () => {
            UI.updateStatusMessage('成功加入房間，等待遊戲開始。');
            // 連線成功後，僅傳送加入請求
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
        });
        
        hostConnection.on('data', handleHostData);
    });
    
    playerPeer.on('error', () => { 
        UI.updateStatusMessage('連線失敗，請確認房間號碼。'); 
    });
};

function handleHostData(data) {
    // V3.0 核心：所有畫面顯示完全由主機下發的 STATE_SYNC 決定
    if (data.type === PACKET_TYPE.STATE_SYNC) {
        localState = data.payload;
        selectedTargets = []; // 每次收到新狀態，強制清空本地選取
        specialValue = null;
        UI.renderPlayerView(localState, handleSeatSelect);
    } 
    else if (data.type === PACKET_TYPE.DECK_UPDATE) {
        UI.renderDeck(data.payload.roleCounts);
    }
}

// 處理玩家點擊圓桌座位的事件
function handleSeatSelect(seatNum) {
    if (!localState || !localState.actionPanel || !localState.actionPanel.show) return;

    if (localState.actionPanel.type === 'single_select' || localState.actionPanel.type === 'consensus') {
        selectedTargets = [seatNum];
        
        // 重新渲染畫面以顯示綠色選取框
        UI.renderPlayerView(localState, handleSeatSelect, selectedTargets);
        
        // 如果是狼人共識，即時將預覽傳給主機，主機會負責廣播給其他狼人
        if (localState.actionPanel.type === 'consensus') {
            hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNum } });
        }
    }
}

// DOM 事件綁定 (僅綁定一次)
document.addEventListener('DOMContentLoaded', () => {
    
    // 確認按鈕
    document.getElementById('btn-confirm-action')?.addEventListener('click', () => {
        if (!hostConnection) return;
        hostConnection.send({ 
            type: PACKET_TYPE.ACTION_SUBMIT, 
            payload: { targets: selectedTargets, specialValue: specialValue } 
        });
        UI.blockActionPanel(); // 送出後立即鎖死介面，等待下一次同步
    });

    // 跳過按鈕
    document.getElementById('btn-pass-action')?.addEventListener('click', () => {
        if (!hostConnection) return;
        // 如果是狼人按下跳過，通知主機廣播空刀預覽
        if (localState.actionPanel.type === 'consensus') {
            hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: 'pass' } });
        }
        hostConnection.send({ 
            type: PACKET_TYPE.ACTION_SUBMIT, 
            payload: { targets: [], specialValue: 'pass' } 
        });
        UI.blockActionPanel();
    });
});