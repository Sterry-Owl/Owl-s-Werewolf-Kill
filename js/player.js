let playerPeer = null;
let hostConnection = null;
let playerInfo = { seatNumber: null, name: null, role: null, isDead: false, isSilenced: false };
let actionPayload = { type: 'none', targets: [], specialValue: null, isDaySkill: false };

function initPlayer(roomId, playerName) {
    playerPeer = new Peer(peerConfig);
    playerPeer.on('open', (id) => {
        UI.updateStatusMessage('正在連線至房間...');
        hostConnection = playerPeer.connect(roomId);
        hostConnection.on('open', () => {
            UI.updateStatusMessage('成功加入房間，等待遊戲開始。');
            hostConnection.send({ type: 'JOIN_ROOM', payload: { name: playerName } });
        });
        setupConnectionListeners();
    });
    playerPeer.on('error', () => { UI.updateStatusMessage('連線失敗，請確認房間號碼。'); });
}

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
            case 'GAME_INIT': handleGameInit(data.payload); break;
            case 'PHASE_CHANGE': handlePhaseChange(data.payload); break;
            case 'WAKE_UP': handleWakeUp(data.payload); break;
            case 'SLEEP':
                UI.lockPlayerInterface();
                UI.hideSpecialOptions();
                resetActionPayload();
                break;
            case 'DEATH_ANNOUNCEMENT': handleDeath(data.payload); break;
            case 'START_VOTE': handleStartVote(data.payload); break;
            case 'END_VOTE':
                UI.hideVotingPanel();
                UI.updateStatusMessage('投票結束，等待結果...');
                break;
            case 'SKILL_BLOCKED':
                playerInfo.isSilenced = true;
                UI.updateStatusMessage('你的技能已被封鎖。');
                break;
        }
    });
}

function handleGameInit(payload) {
    playerInfo.seatNumber = payload.seatNumber;
    playerInfo.role = payload.role;
    playerInfo.isDead = false;
    playerInfo.isSilenced = false;
    
    document.getElementById('player-role-name').textContent = payload.role;
    document.getElementById('player-role-display').classList.remove('hidden');
    document.getElementById('my-card-title').textContent = payload.role;
    
    // 修正：讀取路徑對接 GitHub 本地資源夾，支援中文檔名
    const imgEl = document.getElementById('my-card-img');
    let imgSrc = `./img/${payload.role}.png`;

    try {
        if (typeof library !== 'undefined' && Array.isArray(library)) {
            const cardData = library.find(c => c.name === payload.role);
            if (cardData && cardData.img) imgSrc = cardData.img;
        }
    } catch(e) {}

    imgEl.src = imgSrc;
    imgEl.classList.remove('hidden');
    
    // 雙重保險，圖檔不存在就隱藏
    imgEl.onerror = function() {
        this.style.display = 'none';
    };
    imgEl.onload = function() {
        this.style.display = 'block';
    };

    UI.renderPlayerGrid('player-targets-grid', payload.players, false, onTargetSelect);
    UI.updateStatusMessage('遊戲準備開始。');
}

function handlePhaseChange(payload) {
    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
    if (payload.phase === 'day') {
        if (!playerInfo.isDead && wolfRoles.includes(playerInfo.role)) {
            document.getElementById('btn-self-destruct').classList.remove('hidden');
        }
        if (!playerInfo.isDead && playerInfo.role === '騎士') {
            document.getElementById('btn-day-skill').classList.remove('hidden');
        }
        UI.lockPlayerInterface();
        UI.updateStatusMessage(payload.message || '現在是白天發言階段。');
    } else {
        document.getElementById('btn-self-destruct').classList.add('hidden');
        document.getElementById('btn-day-skill').classList.add('hidden');
        UI.lockPlayerInterface();
        UI.updateStatusMessage(payload.message || '天黑請閉眼...');
    }
}

function handleDeath(payload) {
    if (payload.targetSeat === playerInfo.seatNumber) {
        playerInfo.isDead = true;
        UI.updateStatusMessage('你已經死亡。');
        document.getElementById('btn-self-destruct').classList.add('hidden');
        document.getElementById('btn-day-skill').classList.add('hidden');
        const mySeat = document.getElementById(`player-targets-grid-seat-${playerInfo.seatNumber}`);
        if (mySeat) mySeat.classList.add('dead');
    }
}

function handleWakeUp(payload) {
    if (playerInfo.isDead) return;
    if (playerInfo.isSilenced) {
        UI.updateStatusMessage('你的技能已被封鎖，今晚無法行動。');
        setTimeout(() => { hostConnection.send({ type: 'ACTION_COMPLETE', payload: { targets: [] } }); }, 3000);
        return;
    }

    const roleDef = payload.roleDef;
    actionPayload.type = roleDef.actionType;
    actionPayload.targets = [];
    actionPayload.specialValue = null;

    if (actionPayload.type === 'card_select') {
        UI.renderSpecialOptions(payload.specialOptions, (selectedValue) => {
            actionPayload.specialValue = selectedValue;
            document.getElementById('btn-confirm-action').disabled = false;
        });
        UI.unlockPlayerInterface(roleDef.prompt);
        return;
    }

    if (actionPayload.type === 'complex_select') {
        const skillOptions = [{ label: '查驗', value: 'seer' }, { label: '毒藥', value: 'poison' }, { label: '守護', value: 'guard' }];
        UI.renderSpecialOptions(skillOptions, (selectedValue) => {
            actionPayload.specialValue = selectedValue;
            document.getElementById('btn-confirm-action').disabled = (actionPayload.targets.length === 0);
        });
    }

    document.getElementById('player-action-panel').classList.remove('hidden');
    UI.unlockPlayerInterface(roleDef.prompt);
}

function onTargetSelect(seatNumber, seatEl) {
    switch (actionPayload.type) {
        case 'single_select': case 'single_select_dynamic': case 'consensus': case 'consensus_dynamic': case 'dynamic_select':
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
            if (!actionPayload.specialValue) return alert('請先於上方選擇要贈予的技能');
            actionPayload.targets = [seatNumber];
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
            seatEl.classList.add('selected');
            document.getElementById('btn-confirm-action').disabled = false;
            break;
    }
}

function resetActionPayload() {
    actionPayload = { type: 'none', targets: [], specialValue: null, isDaySkill: false };
    document.querySelectorAll('.player-seat').forEach(s => s.classList.remove('selected'));
    document.getElementById('btn-confirm-action').disabled = true;
}

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
    document.getElementById('btn-day-skill')?.addEventListener('click', () => {
        if (confirm('確定要在現在發起決鬥嗎？')) {
            document.getElementById('btn-day-skill').classList.add('hidden');
            actionPayload.type = 'single_select';
            actionPayload.isDaySkill = true;
            document.getElementById('player-action-panel').classList.remove('hidden');
            UI.unlockPlayerInterface('請選擇你要決鬥的目標');
        }
    });

    document.getElementById('btn-confirm-action').addEventListener('click', () => {
        UI.lockPlayerInterface();
        if (actionPayload.isDaySkill) {
            hostConnection.send({ type: 'DAY_SKILL_ACTION', payload: { targets: actionPayload.targets } });
        } else {
            hostConnection.send({ type: 'ACTION_COMPLETE', payload: { targets: actionPayload.targets, specialValue: actionPayload.specialValue } });
        }
        UI.hideSpecialOptions();
        document.getElementById('player-action-panel').classList.add('hidden');
        resetActionPayload();
    });

    document.getElementById('btn-pass-action')?.addEventListener('click', () => {
        UI.lockPlayerInterface();
        hostConnection.send({ type: 'ACTION_COMPLETE', payload: { targets: [], specialValue: null } });
        UI.hideSpecialOptions();
        document.getElementById('player-action-panel').classList.add('hidden');
        resetActionPayload();
    });

    document.getElementById('btn-cancel-action').addEventListener('click', () => resetActionPayload());

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