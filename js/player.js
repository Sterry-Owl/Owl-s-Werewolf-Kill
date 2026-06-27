// ==========================================
// v3.8.0 玩家端網路與狀態管理 (Player Client)
// ==========================================

let playerPeer = null;
let hostConnection = null;
let mySeatNumber = null;
let currentActionTarget = [];
let localState = {}; 

window.initPlayer = function(roomId, playerName) {
    playerPeer = new Peer(PEER_CONFIG);
    playerPeer.on('open', (id) => {
        hostConnection = playerPeer.connect(roomId);
        hostConnection.on('open', () => {
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
        });
        setupPlayerConnectionListeners(hostConnection);
    });
    playerPeer.on('error', () => { alert('無法連線至房間，請確認代碼是否正確。'); });
};

function setupPlayerConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch(data.type) {
            case PACKET_TYPE.JOIN_SUCCESS:
                mySeatNumber = data.payload.seatNumber;
                break;
            case PACKET_TYPE.STATE_SYNC:
                localState = data.payload;
                currentActionTarget = [];
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
        hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: seatNumber } });
    } else {
        currentActionTarget = [seatNumber];
    }
    UI.renderPlayerView(localState, handleSeatSelect, handleActionSubmit, currentActionTarget, false);
}

function handleActionSubmit(actionId) {
    if (!localState.actionPanel || !localState.actionPanel.show) return;
    
    const packetType = localState.actionPanel.submitPacketType || PACKET_TYPE.ACTION_SUBMIT;
    const isPassAction = (actionId === 'pass' || actionId === 'save');
    const finalTargets = isPassAction ? [] : currentActionTarget;
    
    hostConnection.send({ 
        type: packetType, 
        payload: { actionId: actionId, targets: finalTargets } 
    });
    
    if (packetType === PACKET_TYPE.ACTION_SUBMIT && localState.phase === GAME_PHASE.NIGHT_ACTION && isWolfRole(localState.myRole) && actionId === 'pass') {
         hostConnection.send({ type: PACKET_TYPE.WOLF_PREVIEW, payload: { target: 'pass' } });
    }
    
    UI.blockActionPanel();
}

function isWolfRole(roleStr) {
    if(!roleStr) return false;
    return roleStr.includes("狼");
}

document.addEventListener('DOMContentLoaded', () => {
    // 綁定自爆按鈕
    const btnExplode = document.getElementById('btn-self-explode');
    if (btnExplode) {
        btnExplode.addEventListener('click', () => {
            if (confirm("確定要自爆嗎？這將立即中斷白天發言並進入黑夜！")) {
                if (hostConnection) hostConnection.send({ type: PACKET_TYPE.WOLF_EXPLODE });
                btnExplode.classList.add('hidden');
            }
        });
    }

    // 綁定票型紀錄切換按鈕
    const btnHistory = document.getElementById('btn-vote-history');
    let isHistoryShowing = false;
    if (btnHistory) {
        btnHistory.addEventListener('click', () => {
            isHistoryShowing = !isHistoryShowing;
            UI.renderPlayerView(localState, handleSeatSelect, handleActionSubmit, currentActionTarget, isHistoryShowing);
        });
    }

    // [新增] 綁定退水按鈕
    const btnBailout = document.getElementById('btn-bailout');
    if (btnBailout) {
        btnBailout.addEventListener('click', () => {
            if (confirm("確定要退出警長競選嗎？退水後將喪失競選資格及本次投票權。")) {
                if (hostConnection) hostConnection.send({ type: PACKET_TYPE.SHERIFF_BAILOUT });
            }
        });
    }
});