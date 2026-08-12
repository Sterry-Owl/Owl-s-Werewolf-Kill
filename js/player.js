// ==========================================
// v4.0.3 玩家端網路與狀態管理 (Player Client)
// 檔案位置: js/player.js
// ==========================================

let hostConnection = null;
let mySeatNumber = null;
let currentActionTarget = [];
let localState = {}; 
let lockedActionSignature = null;
let savedRoomId = null;
let savedPlayerName = null;
let lastPingTime = Date.now();
let heartbeatMonitor = null;
let isReconnecting = false;

window.initPlayer = function(roomId, playerName) {
    savedRoomId = roomId;
    savedPlayerName = playerName;

    // [關鍵升級] 本地端動態生成唯一 ID，徹底繞過 PeerJS 伺服器的派發延遲與擁塞
    const localGeneratedId = 'player_' + Math.random().toString(36).substring(2, 10);
    
    // 將自己生成的 ID 強制塞入，這樣就能瞬間啟動連線，不再掛起
    playerPeer = new Peer(localGeneratedId, PEER_CONFIG);
    
    playerPeer.on('open', (id) => {
        // [嚴謹架構] 保持與房主端絕對一致的尋址演算法 (低耦合通訊)
        const targetHostId = `${GAME_PREFIX}${roomId}`;
        hostConnection = playerPeer.connect(targetHostId);
        
        hostConnection.on('open', () => {
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
            startHeartbeatMonitor(); // [新增] 啟動心跳監控
        });

        // [新增] 綁定底層連線異常事件，觸發靜默重連
        hostConnection.on('close', triggerSilentReconnect);
        hostConnection.on('error', triggerSilentReconnect);
        
        setupPlayerConnectionListeners(hostConnection);
    });
    
    playerPeer.on('error', (err) => { 
        console.error("連線錯誤:", err);
        alert('無法連線至房間，請確認房號是否正確，或檢查網路狀態。'); 
    });
};

function setupPlayerConnectionListeners(conn) {
    conn.on('data', (data) => {
        // [新增] 攔截主機心跳並自動回應
        if (data.type === PACKET_TYPE.PING) {
            lastPingTime = Date.now();
            try { conn.send({ type: PACKET_TYPE.PONG }); } catch (e) {}
            return;
        }

        switch(data.type) {
            case PACKET_TYPE.JOIN_SUCCESS:
                mySeatNumber = data.payload.seatNumber;
                break;
            case PACKET_TYPE.STATE_SYNC:
                const isNewPhase = localState.phase !== data.payload.phase || localState.nightStepIndex !== data.payload.nightStepIndex;
                localState = data.payload;
                
                if (isNewPhase) {
                    currentActionTarget = [];
                    lockedActionSignature = null;
                }
                const currentSignature = `${localState.phase}_${localState.nightStepIndex}`;
                if (lockedActionSignature === currentSignature && localState.actionPanel) {
                    localState.actionPanel.buttons = [];
                    if (!localState.actionPanel.hasActed) {
                        localState.actionPanel.prompt = "行動已送出，等待系統確認...";
                    }
                }
                
                UI.renderPlayerView(localState, handleSeatSelect, handleActionSubmit, currentActionTarget, false);
                break;
        }
    });
}

function handleSeatSelect(seatNumber) {
    if (!localState.actionPanel || !localState.actionPanel.show) return;
    
    if (localState.actionPanel.type === 'single_select') {
        currentActionTarget = [seatNumber];
    } else if (localState.actionPanel.type === 'consensus') {
        currentActionTarget = [seatNumber];
        if (hostConnection) hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNumber } });
    } else if (localState.actionPanel.type === 'triple_select') {
        const idx = currentActionTarget.indexOf(seatNumber);
        if (idx > -1) {
            currentActionTarget.splice(idx, 1); 
        } else {
            if (currentActionTarget.length < 3) {
                currentActionTarget.push(seatNumber);
            } else {
                currentActionTarget.shift(); 
                currentActionTarget.push(seatNumber);
            }
        }
    } else if (localState.actionPanel.type === 'double_select' || localState.actionPanel.type === 'up_to_two') {
        const idx = currentActionTarget.indexOf(seatNumber);
        if (idx > -1) {
            currentActionTarget.splice(idx, 1); 
        } else {
            if (currentActionTarget.length < 2) {
                currentActionTarget.push(seatNumber);
            } else {
                currentActionTarget.shift(); 
                currentActionTarget.push(seatNumber);
            }
        }
    } else {
        currentActionTarget = [seatNumber];
    }
    UI.renderPlayerView(localState, handleSeatSelect, handleActionSubmit, currentActionTarget, false);
}

function handleActionSubmit(actionId, extraPayload = null) {
    if (!localState.actionPanel || !localState.actionPanel.show) return;
    if (actionId === 'SPECIAL_DAY_SKILL_SUBMIT') {
        const skillDef = localState.daySkill;
        if (skillDef && skillDef.requiresTarget && currentActionTarget.length === 0) {
            return alert('請先選擇目標！');
        }
        hostConnection.send({ 
            type: 'DAY_SKILL_SUBMIT', 
            payload: { skillId: extraPayload, target: currentActionTarget.length > 0 ? currentActionTarget[0] : null } 
        });
        UI.blockActionPanel();
        return; 
    }

    const packetType = localState.actionPanel.submitPacketType || PACKET_TYPE.ACTION_SUBMIT;
    const isPassAction = (actionId === 'pass' || actionId === 'save');
    const finalTargets = isPassAction ? [] : currentActionTarget;
    hostConnection.send({ 
        type: packetType, 
        payload: { actionId: actionId, targets: finalTargets } 
    });
    lockedActionSignature = `${localState.phase}_${localState.nightStepIndex}`;
    UI.blockActionPanel();
}

document.addEventListener('DOMContentLoaded', () => {
    const btnExplode = document.getElementById('btn-self-explode');
    if (btnExplode) {
        btnExplode.addEventListener('click', () => {
            if (hostConnection) hostConnection.send({ type: PACKET_TYPE.WOLF_EXPLODE });
            btnExplode.classList.add('hidden');
        });
    }

    const btnHistory = document.getElementById('btn-vote-history');
    let isHistoryShowing = false;
    if (btnHistory) {
        btnHistory.addEventListener('click', () => {
            isHistoryShowing = !isHistoryShowing;
            UI.renderPlayerView(localState, handleSeatSelect, handleActionSubmit, currentActionTarget, isHistoryShowing);
        });
    }

    const btnBailout = document.getElementById('btn-bailout');
    if (btnBailout) {
        btnBailout.addEventListener('click', () => {
            if (hostConnection) {
                hostConnection.send({ type: PACKET_TYPE.SHERIFF_BAILOUT });
                btnBailout.classList.add('hidden');
            }
        });
    }

    const btnWolfChat = document.getElementById('btn-wolf-chat');
    const wolfChatModal = document.getElementById('wolf-chat-modal');
    if (btnWolfChat && wolfChatModal) {
        btnWolfChat.addEventListener('click', () => {
            const isHidden = wolfChatModal.style.display === 'none' || wolfChatModal.classList.contains('hidden');
            if (isHidden) {
                wolfChatModal.style.display = 'block';
                wolfChatModal.classList.remove('hidden');
            } else {
                wolfChatModal.style.display = 'none';
                wolfChatModal.classList.add('hidden');
            }
        });
    }
});
window.addEventListener('WOLF_CHAT_OUTGOING', (e) => {
    if (hostConnection) { 
        hostConnection.send({
            type: 'WOLF_CHAT_SEND',
            payload: { text: e.detail }
        });
    }
});
function startHeartbeatMonitor() {
    if (heartbeatMonitor) clearInterval(heartbeatMonitor);
    lastPingTime = Date.now();
    heartbeatMonitor = setInterval(() => {
        if (Date.now() - lastPingTime > NETWORK_CONFIG.TIMEOUT_LIMIT) {
            triggerSilentReconnect();
        }
    }, NETWORK_CONFIG.PING_INTERVAL);
}

function triggerSilentReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    if (heartbeatMonitor) clearInterval(heartbeatMonitor);
    
    const attemptReconnect = () => {
        if (hostConnection) hostConnection.close();
        if (playerPeer) playerPeer.destroy();
        
        // 生成全新憑證，避免網路層狀態殘留
        const localGeneratedId = 'player_' + Math.random().toString(36).substring(2, 10);
        playerPeer = new Peer(localGeneratedId, PEER_CONFIG);
        
        playerPeer.on('open', () => {
            const targetHostId = `${GAME_PREFIX}${savedRoomId}`;
            hostConnection = playerPeer.connect(targetHostId);
            
            hostConnection.on('open', () => {
                isReconnecting = false;
                // 重連成功，發送接管請求
                hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: savedPlayerName } });
                startHeartbeatMonitor();
            });
            
            hostConnection.on('close', triggerSilentReconnect);
            hostConnection.on('error', triggerSilentReconnect);
            setupPlayerConnectionListeners(hostConnection);
        });
        
        playerPeer.on('error', () => {
            // 重連失敗，執行退避重試策略 (Retry Policy)
            setTimeout(attemptReconnect, NETWORK_CONFIG.RECONNECT_DELAY);
        });
    };
    
    setTimeout(attemptReconnect, NETWORK_CONFIG.RECONNECT_DELAY);
}
