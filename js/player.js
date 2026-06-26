// ==========================================
// v3.6.9 玩家終端層 (Dumb Client)
// ==========================================

let playerPeer = null;
let hostConnection = null;
let localState = null;
let selectedTargets = [];
let currentPrompt = ""; 
let showVoteHistory = false; // [新增] 控制歷史紀錄面板顯示

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
            
            // [新增] 綁定浮動按鈕事件
            document.getElementById('btn-vote-history')?.addEventListener('click', toggleVoteHistory);
            document.getElementById('btn-self-explode')?.addEventListener('click', submitSelfExplode);
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

// [新增] 切換歷史紀錄面板 (純前端視圖控制)
function toggleVoteHistory() {
    showVoteHistory = !showVoteHistory;
    if (localState) {
        UI.renderPlayerView(localState, handleSeatSelect, submitPlayerAction, selectedTargets, showVoteHistory);
    }
}

// [新增] 發送自爆封包
function submitSelfExplode() {
    if (!hostConnection || !localState || !localState.allowSelfExplode) return;
    if (confirm("確定要自爆嗎？這將立刻結束發言階段並進入黑夜！")) {
        hostConnection.send({ type: PACKET_TYPE.WOLF_EXPLODE, payload: {} });
        UI.updateStatusMessage('自爆指令已送出，等待伺服器同步...');
    }
}

function handleHostData(data) {
    if (data.type === PACKET_TYPE.STATE_SYNC) {
        const newState = data.payload;
        const newPrompt = (newState.actionPanel && newState.actionPanel.show) ? newState.actionPanel.prompt : "";
        
        if (!localState || localState.phase !== newState.phase || (!newState.actionPanel.show && localState.actionPanel.show)) {
            selectedTargets = [];
        }
        
        currentPrompt = newPrompt;
        localState = newState;
        
        // [修改] 傳入 showVoteHistory 參數給渲染器
        UI.renderPlayerView(localState, handleSeatSelect, submitPlayerAction, selectedTargets, showVoteHistory);
    } 
    else if (data.type === PACKET_TYPE.DECK_UPDATE) {
        UI.renderDeck(data.payload.roleCounts);
    }
}

function handleSeatSelect(seatNum) {
    if (!localState || !localState.actionPanel || !localState.actionPanel.show) return;
    
    selectedTargets = [seatNum];
    UI.renderPlayerView(localState, handleSeatSelect, submitPlayerAction, selectedTargets, showVoteHistory);
    
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