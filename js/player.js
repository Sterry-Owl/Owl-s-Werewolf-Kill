// ==========================================
// v3.0 玩家終端層 (Dumb Client)
// ==========================================

let playerPeer = null;
let hostConnection = null;
let localState = null;
let selectedTargets = [];
let specialValue = null;
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
            specialValue = null;
            currentPrompt = newPrompt;
        }
        localState = newState;
        UI.renderPlayerView(localState, handleSeatSelect, selectedTargets);
    } 
    else if (data.type === PACKET_TYPE.DECK_UPDATE) {
        UI.renderDeck(data.payload.roleCounts);
    }
}

function handleSeatSelect(seatNum) {
    if (!localState || !localState.actionPanel || !localState.actionPanel.show) return;
    if (localState.actionPanel.type === 'single_select' || localState.actionPanel.type === 'consensus') {
        selectedTargets = [seatNum];
        UI.renderPlayerView(localState, handleSeatSelect, selectedTargets);
        
        if (localState.actionPanel.type === 'consensus') {
            hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNum } });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-confirm-action')?.addEventListener('click', () => {
        if (!hostConnection || !localState || !localState.actionPanel) return;
        
        // 嚴格依賴主機指示的封包類型，不介入遊戲邏輯判斷
        hostConnection.send({ 
            type: localState.actionPanel.submitPacketType, 
            payload: { targets: selectedTargets, specialValue: specialValue } 
        });
        UI.blockActionPanel(); 
    });

    document.getElementById('btn-pass-action')?.addEventListener('click', () => {
        if (!hostConnection || !localState || !localState.actionPanel) return;
        
        if (localState.actionPanel.type === 'consensus') {
            hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: 'pass' } });
        }
        
        hostConnection.send({ 
            type: localState.actionPanel.submitPacketType, 
            payload: { targets: [], specialValue: 'pass' } 
        });
        UI.blockActionPanel();
    });
});