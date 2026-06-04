// js/player.js

let playerPeer = null;
let hostConnection = null;
let playerInfo = {
    seatNumber: null,
    name: null,
    role: null,
    isDead: false,
    isSilenced: false // 血月使徒或狼鴉之爪復仇導致的技能封鎖
};

// 暫存複合技能或雙選技能的資料
let actionPayload = {
    type: 'none', // single, double, complex, card_select
    targets: [],
    specialValue: null 
};

// ==========================================
// 1. 初始化與連線設定
// ==========================================
function initPlayer(roomId, playerName) {
    playerPeer = new Peer(peerConfig);

    playerPeer.on('open', (id) => {
        console.log('玩家 PeerJS 連線成功, ID:', id);
        UI.updateStatusMessage('正在連線至房間...');
        
        hostConnection = playerPeer.connect(roomId);
        
        hostConnection.on('open', () => {
            UI.updateStatusMessage('成功加入房間，等待遊戲開始。');
            hostConnection.send({
                type: 'JOIN_ROOM',
                payload: { name: playerName }
            });
        });

        setupConnectionListeners();
    });

    playerPeer.on('error', (err) => {
        console.error('PeerJS 錯誤:', err);
        UI.updateStatusMessage('連線失敗，請確認房間號碼。');
    });
}

// ==========================================
// 2. 監聽主持人廣播訊息
// ==========================================
function setupConnectionListeners() {
    hostConnection.on('data', (data) => {
        switch(data.type) {
            case 'JOIN_SUCCESS':
                playerInfo.seatNumber = data.payload.seatNumber;
                document.getElementById('player-seat-number').textContent = data.payload.seatNumber;
                break;
            case 'LOBBY_UPDATE':
                UI.renderPlayerGrid('player-targets-grid', data.payload.players, false, onTargetSelect);
                break;
            case 'GAME_INIT':
                handleGameInit(data.payload);
                break;
            case 'PHASE_CHANGE':
                handlePhaseChange(data.payload);
                break;
            case 'WAKE_UP':
                handleWakeUp(data.payload);
                break;
            case 'SLEEP':
                UI.lockPlayerInterface();
                UI.hideSpecialOptions();
                resetActionPayload();
                break;
            case 'DEATH_ANNOUNCEMENT':
                handleDeath(data.payload);
                break;
            case 'START_VOTE':
                handleStartVote(data.payload);
                break;
            case 'END_VOTE':
                UI.hideVotingPanel();
                UI.updateStatusMessage('投票結束，等待結果...');
                break;
            case 'SKILL_BLOCKED':
                // 血月使徒封鎖事件
                playerInfo.isSilenced = true;
                UI.updateStatusMessage('你的技能已被血月使徒封鎖。');
                break;
        }
    });
}

// ==========================================
// 3. 遊戲流程事件處理
// ==========================================
function handleGameInit(payload) {
    playerInfo.seatNumber = payload.seatNumber;
    playerInfo.role = payload.role;
    playerInfo.isDead = false;
    playerInfo.isSilenced = false;
    
    document.getElementById('player-seat-number').textContent = payload.seatNumber;
    document.getElementById('player-role-name').textContent = payload.role;
    document.getElementById('player-role-display').classList.remove('hidden');
    
    // 渲染全場玩家網格供夜晚選取目標
    UI.renderPlayerGrid('player-targets-grid', payload.players, false, onTargetSelect);
    
    // 若為狼人陣營，顯示白天自爆按鈕
    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
    if (wolfRoles.includes(playerInfo.role)) {
        document.getElementById('btn-self-destruct').classList.remove('hidden');
    }

    UI.updateStatusMessage('遊戲準備開始。');
}

function handlePhaseChange(payload) {
    if (payload.phase === 'day') {
        UI.lockPlayerInterface();
        UI.updateStatusMessage(payload.message || '現在是白天發言階段。');
    } else {
        UI.lockPlayerInterface();
        UI.updateStatusMessage('天黑請閉眼...');
    }
}

function handleDeath(payload) {
    if (payload.targetSeat === playerInfo.seatNumber) {
        playerInfo.isDead = true;
        UI.updateStatusMessage('你已經死亡。');
        document.getElementById('btn-self-destruct').classList.add('hidden');
        
        // 將自己的座位標記為死亡狀態
        const mySeat = document.getElementById(`player-targets-grid-seat-${playerInfo.seatNumber}`);
        if (mySeat) mySeat.classList.add('dead');
    }
}

// ==========================================
// 4. 技能介面解鎖與事件處理
// ==========================================
function handleWakeUp(payload) {
    if (playerInfo.isDead) return;

    // 處理技能封鎖狀態 (如被血月使徒封鎖或狼鴉之爪復仇)
    if (playerInfo.isSilenced) {
        UI.updateStatusMessage('你的技能已被封鎖，今晚無法行動。');
        setTimeout(() => {
            hostConnection.send({ type: 'ACTION_COMPLETE', payload: { targets: [] } });
        }, 3000); // 假裝思考後回傳空結果
        return;
    }

    const roleDef = payload.roleDef;
    actionPayload.type = roleDef.actionType;
    actionPayload.targets = [];
    actionPayload.specialValue = null;

    // 特殊介面：盜賊選牌
    if (actionPayload.type === 'card_select') {
        UI.renderSpecialOptions(payload.specialOptions, (selectedValue) => {
            actionPayload.specialValue = selectedValue;
            document.getElementById('btn-confirm-action').disabled = false;
        });
        UI.unlockPlayerInterface(roleDef.prompt);
        return;
    }

    // 特殊介面：奇蹟商人選技能
    if (actionPayload.type === 'complex_select') {
        const skillOptions = [
            { label: '查驗', value: 'seer' },
            { label: '毒藥', value: 'poison' },
            { label: '守護', value: 'guard' }
        ];
        UI.renderSpecialOptions(skillOptions, (selectedValue) => {
            actionPayload.specialValue = selectedValue;
            // 必須先選技能才能選人，選定技能後維持確認按鈕禁用，直到選擇目標
            document.getElementById('btn-confirm-action').disabled = (actionPayload.targets.length === 0);
        });
    }

    // 解鎖目標選取介面
    document.getElementById('player-action-panel').classList.remove('hidden');
    UI.unlockPlayerInterface(roleDef.prompt);
}

function onTargetSelect(seatNumber, seatEl) {
    switch (actionPayload.type) {
        case 'single_select':
        case 'single_select_dynamic':
        case 'consensus':
        case 'consensus_dynamic':
        case 'dynamic_select':
            actionPayload.targets = [seatNumber];
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
            seatEl.classList.add('selected');
            document.getElementById('btn-confirm-action').disabled = false;
            break;
            
        case 'double_select':
            const index = actionPayload.targets.indexOf(seatNumber);
            if (index > -1) {
                actionPayload.targets.splice(index, 1);
                seatEl.classList.remove('selected');
            } else if (actionPayload.targets.length < 2) {
                actionPayload.targets.push(seatNumber);
                seatEl.classList.add('selected');
            }
            document.getElementById('btn-confirm-action').disabled = (actionPayload.targets.length !== 2);
            break;
            
        case 'complex_select':
            if (!actionPayload.specialValue) {
                alert('請先於上方選擇要贈予的技能');
                return;
            }
            actionPayload.targets = [seatNumber];
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
            seatEl.classList.add('selected');
            document.getElementById('btn-confirm-action').disabled = false;
            break;
    }
}

function resetActionPayload() {
    actionPayload = { type: 'none', targets: [], specialValue: null };
    document.querySelectorAll('.player-seat').forEach(s => s.classList.remove('selected'));
    document.getElementById('btn-confirm-action').disabled = true;
}

// ==========================================
// 5. 白天系統與使用者按鈕事件綁定
// ==========================================
function handleStartVote(payload) {
    if (playerInfo.isDead) return;
    UI.showVotingPanel(payload.alivePlayers, (targetSeat) => {
        if (confirm(`確定要投票給 ${targetSeat} 號玩家嗎？`)) {
            UI.hideVotingPanel();
            hostConnection.send({ type: 'VOTE_SUBMIT', payload: { target: targetSeat } });
        } else {
            document.querySelectorAll('#voting-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-confirm-action').addEventListener('click', () => {
        UI.lockPlayerInterface();
        hostConnection.send({
            type: 'ACTION_COMPLETE',
            payload: {
                targets: actionPayload.targets,
                specialValue: actionPayload.specialValue
            }
        });
        UI.hideSpecialOptions();
        resetActionPayload();
    });

    document.getElementById('btn-cancel-action').addEventListener('click', () => {
        resetActionPayload();
    });

    document.getElementById('btn-abstain-vote').addEventListener('click', () => {
        UI.hideVotingPanel();
        hostConnection.send({ type: 'VOTE_SUBMIT', payload: { target: 'abstain' } });
    });
    
    document.getElementById('btn-self-destruct').addEventListener('click', () => {
        if (confirm('確定要自爆嗎？')) {
            hostConnection.send({ type: 'TRIGGER_SELF_DESTRUCT', payload: {} });
            document.getElementById('btn-self-destruct').classList.add('hidden');
        }
    });
});