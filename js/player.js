// ==========================================
// v3.6.3 player
// ==========================================

let playerPeer = null;
let hostConnection = null;
let localState = null;
let selectedTargets = [];
let currentPrompt = ""; 

window.initPlayer = function(roomId, playerName) {
    UI.updateStatusMessage('正在初始化網路連線 (1/3)...');

    try {
        playerPeer = new Peer(PEER_CONFIG);
    } catch (err) {
        UI.updateStatusMessage('網路模組載入失敗，請重新整理網頁。');
        return;
    }

    playerPeer.on('open', (id) => {
        UI.updateStatusMessage(`連線伺服器成功，尋找房間 ${roomId} (2/3)...`);
        
        hostConnection = playerPeer.connect(roomId, { reliable: true }); 
        
        hostConnection.on('open', () => {
            UI.updateStatusMessage('成功加入房間，等待遊戲開始 (3/3)...');
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
        });

        hostConnection.on('data', handleHostData);

        hostConnection.on('close', () => {
            UI.updateStatusMessage('⚠️ 與主控台的連線已中斷。');
        });
    });

    playerPeer.on('error', (err) => { 
        let errorMsg = '連線失敗，請確認狀態。';
        if (err.type === 'peer-unavailable') {
            errorMsg = `⚠️ 找不到房間 ${roomId}，請確認主機是否已開啟。`;
        } else if (err.type === 'network') {
            errorMsg = '⚠️ 網路連線異常，請檢查您的網路狀態。';
        }
        UI.updateStatusMessage(errorMsg); 
    });
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
    
    if (localState.actionPanel.type === 'consensus') {
        hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNum } });
    }
}

function submitPlayerAction(actionId) {
    if (!hostConnection || !localState || !localState.actionPanel) return;

    if (actionId === 'pass' && localState.actionPanel.type === 'consensus') {
        hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: 'pass' } });
    }

    hostConnection.send({ 
        type: localState.actionPanel.submitPacketType, 
        payload: { targets: selectedTargets, actionId: actionId } 
    });
    
    UI.blockActionPanel();
}