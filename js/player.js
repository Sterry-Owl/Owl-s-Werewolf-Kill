// ==========================================
// v4.0.3 玩家端網路與狀態管理 (Player Client)
// 檔案位置: js/player.js
// ==========================================

let playerPeer = null;
let hostConnection = null;
let mySeatNumber = null;
let currentActionTarget = [];
let localState = {}; 

window.initPlayer = function(roomId, playerName) {
    // [關鍵升級] 本地端動態生成唯一 ID，徹底繞過 PeerJS 伺服器的派發延遲與擁塞
    const localGeneratedId = 'player_' + Math.random().toString(36).substring(2, 10);
    
    // 將自己生成的 ID 強制塞入，這樣就能瞬間啟動連線，不再掛起
    playerPeer = new Peer(localGeneratedId, PEER_CONFIG);
    
    playerPeer.on('open', (id) => {
        hostConnection = playerPeer.connect(roomId);
        hostConnection.on('open', () => {
            hostConnection.send({ type: PACKET_TYPE.JOIN_ROOM, payload: { name: playerName } });
        });
        setupPlayerConnectionListeners(hostConnection);
    });
    
    playerPeer.on('error', (err) => { 
        console.error("連線錯誤:", err);
        alert('無法連線至房間，請確認房號是否正確，或檢查網路狀態。'); 
    });
};

function setupPlayerConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch(data.type) {
            case PACKET_TYPE.JOIN_SUCCESS:
                mySeatNumber = data.payload.seatNumber;
                break;
            case PACKET_TYPE.STATE_SYNC:
                const isNewPhase = localState.phase !== data.payload.phase || localState.nightStepIndex !== data.payload.nightStepIndex;
                localState = data.payload;
                
                if (isNewPhase) {
                    currentActionTarget = [];
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
    } else if (localState.actionPanel.type === 'double_select') {
        // [乾淨擴充] 支援魔術師的雙目標選擇邏輯
        const idx = currentActionTarget.indexOf(seatNumber);
        if (idx > -1) {
            currentActionTarget.splice(idx, 1); // 再次點擊即取消選取
        } else {
            if (currentActionTarget.length < 2) {
                currentActionTarget.push(seatNumber);
            } else {
                currentActionTarget.shift(); // 踢除最舊的，加入最新的，確保最多只有兩個
                currentActionTarget.push(seatNumber);
            }
        }
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
    
    // [純淨架構] 前端放棄思考，只負責傳遞 [目標, 動作]
    hostConnection.send({ 
        type: packetType, 
        payload: { actionId: actionId, targets: finalTargets } 
    });
    
    UI.blockActionPanel();
}

document.addEventListener('DOMContentLoaded', () => {
    const btnExplode = document.getElementById('btn-self-explode');
    if (btnExplode) {
        btnExplode.addEventListener('click', () => {
            if (confirm("確定要自爆嗎？這將立即中斷白天發言並進入黑夜！")) {
                if (hostConnection) hostConnection.send({ type: PACKET_TYPE.WOLF_EXPLODE });
                btnExplode.classList.add('hidden');
            }
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
            if (confirm("確定要退出警長競選嗎？退水後將喪失競選資格及本次投票權。")) {
                if (hostConnection) hostConnection.send({ type: PACKET_TYPE.SHERIFF_BAILOUT });
            }
        });
    }
    const btnDaySkill = document.getElementById('btn-day-skill');
    const localPanel = document.getElementById('local-day-skill-panel');
    const targetsContainer = document.getElementById('local-day-skill-targets');
    const btnCancelSkill = document.getElementById('btn-cancel-day-skill');
    const promptEl = document.getElementById('local-day-skill-prompt');

    if (btnDaySkill && localPanel && targetsContainer && btnCancelSkill) {
        btnDaySkill.addEventListener('click', () => {
            if (!localState.daySkill) return;
            
            btnDaySkill.classList.add('hidden');
            localPanel.classList.remove('hidden');
            promptEl.textContent = `發動技能：${localState.daySkill.buttonText}\n請選擇目標：`;
            targetsContainer.innerHTML = '';
            localState.daySkill.selectableSeats.forEach(seat => {
                const btn = document.createElement('button');
                btn.className = 'btn-primary';
                btn.textContent = `${seat}號`;
                btn.style.margin = '4px';
                btn.style.flex = '1 1 30%';
                
                btn.onclick = () => {
                    if (confirm(`確定要對 ${seat} 號玩家 ${localState.daySkill.buttonText} 嗎？`)) {
                        if (hostConnection) {
                            hostConnection.send({ 
                                type: 'DAY_SKILL_SUBMIT', 
                                payload: { skillId: localState.daySkill.id, target: seat } 
                            });
                        }
                        localPanel.classList.add('hidden');
                    }
                };
                targetsContainer.appendChild(btn);
            });
        });

        btnCancelSkill.addEventListener('click', () => {
            localPanel.classList.add('hidden');
            btnDaySkill.classList.remove('hidden');
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
