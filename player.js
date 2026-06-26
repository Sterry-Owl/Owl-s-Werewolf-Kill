// ==========================================
// v3.6.3 玩家終端層 (Dumb Client) - 修復命名衝突
// ==========================================

let playerPeer = null;
let hostConnection = null;
let localState = null;
let selectedTargets = [];
let currentPrompt = ""; 

window.initPlayer = function(roomId, playerName) {
    playerPeer = new Peer(PEER_CONFIG);
    playerPeer.on('open', (id) => {
        UI.updateStatusMessage('正在連線至房間...');
        hostConnection = playerPeer.connect(roomId);
        hostConnection.on('open', () => {
            UI.updateStatusMessage('成功加入房間，等待遊戲開始。');
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
        });
        hostConnection.on('data', handleHostData);
    });
    playerPeer.on('error', () => { UI.updateStatusMessage('連線失敗，請確認房間號碼。'); });
};

function handleHostData(data) {
    if (data.type === PACKET_TYPE.STATE_SYNC) {
        const newState = data.payload;
        const newPrompt = (newState.actionPanel && newState.actionPanel.show) ? newState.actionPanel.prompt : "";
        
        if (!localState || localState.phase !== newState.phase || currentPrompt !== newPrompt) {
            selectedTargets = [];
            currentPrompt = newPrompt;
        }
        
        localState = newState;
        // [關鍵修復] 綁定更名後的 submitPlayerAction
        UI.renderPlayerView(localState, handleSeatSelect, submitPlayerAction, selectedTargets);
    } 
    else if (data.type === PACKET_TYPE.DECK_UPDATE) {
        UI.renderDeck(data.payload.roleCounts);
    }
}

function handleSeatSelect(seatNum) {
    if (!localState || !localState.actionPanel || !localState.actionPanel.show) return;
    
    selectedTargets = [seatNum];
    UI.renderPlayerView(localState, handleSeatSelect, submitPlayerAction, selectedTargets);
    
    // 如果是狼人，即時傳送黃色預覽給隊友
    if (localState.actionPanel.type === 'consensus') {
        hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNum } });
    }
}

// [關鍵修復] 更改函式名稱，徹底避免與 host.js 發生全域覆蓋
function submitPlayerAction(actionId) {
    if (!hostConnection || !localState || !localState.actionPanel) return;

    // 如果按下的是空刀/跳過，且是狼人階段，廣播空刀預覽
    if (actionId === 'pass' && localState.actionPanel.type === 'consensus') {
        hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: 'pass' } });
    }

    // 嚴格依賴主機指示的封包類型
    hostConnection.send({ 
        type: localState.actionPanel.submitPacketType, 
        payload: { targets: selectedTargets, actionId: actionId } 
    });
    
    UI.blockActionPanel();
}