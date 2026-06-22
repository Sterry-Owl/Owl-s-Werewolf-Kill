let playerPeer = null;
let hostConnection = null;
let playerInfo = { seatNumber: null, name: null, role: null, isDead: false, isSilenced: false };
let actionPayload = { type: 'none', targets: [], specialValue: null, isDaySkill: false, isWWK: false };

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
            case 'DECK_UPDATE': // 接收大廳實時配置更新
                handleDeckUpdate(data.payload); 
                break;
            case 'GAME_INIT': 
                handleGameInit(data.payload); 
                break;
            case 'PHASE_CHANGE': handlePhaseChange(data.payload); break;
            case 'WAKE_UP': handleWakeUp(data.payload); break;
            case 'SLEEP':
                UI.lockPlayerInterface();
                UI.hideSpecialOptions();
                resetActionPayload();
                break;
            case 'DEATH_ANNOUNCEMENT': handleDeath(data.payload); break;
            case 'START_VOTE': handleStartVote(data.payload); break;
            case 'VOTE_RESULTS': handleVoteResults(data.payload); break; 
            case 'END_VOTE':
                UI.hideVotingPanel();
                UI.updateStatusMessage('投票結束，等待結果...');
                break;
            case 'SKILL_BLOCKED':
                playerInfo.isSilenced = true;
                UI.updateStatusMessage('你的技能已被封鎖。');
                break;
            case 'WOLF_PREVIEW_UPDATE': handleWolfPreview(data.payload); break; 
        }
    });
}

function handleDeckUpdate(payload) {
    if (payload.roleCounts) {
        const configContainer = document.getElementById('player-config-display');
        configContainer.innerHTML = '';
        Object.entries(payload.roleCounts).forEach(([role, count]) => {
            if(count > 0) {
                configContainer.innerHTML += `<div style="display:flex; align-items:center; gap:5px;"><img src="./img/${role}.png" style="width:30px;height:30px;border-radius:4px;" onerror="this.style.display='none'"> <span style="color:#ccc;font-size:14px;">x${count}</span></div>`;
            }
        });
    }
}

function handleGameInit(payload) {
    playerInfo.seatNumber = payload.seatNumber;
    playerInfo.role = payload.role;
    playerInfo.isDead = false;
    playerInfo.isSilenced = false;
    
    document.getElementById('player-role-name').textContent = payload.role;
    document.getElementById('player-role-display').classList.remove('hidden');
    document.getElementById('my-card-title').textContent = payload.role;
    
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
    imgEl.onerror = function() { this.style.display = 'none'; };
    imgEl.onload = function() { this.style.display = 'block'; };

    handleDeckUpdate(payload);
    UI.renderPlayerGrid('player-targets-grid', payload.players, false, onTargetSelect);
    UI.updateStatusMessage('遊戲準備開始。');
}

function handlePhaseChange(payload) {
    const selfDestructRoles = ["狼人", "狼王", "白狼王", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
    if (payload.phase === 'day') {
        if (!playerInfo.isDead && playerInfo.role && selfDestructRoles.includes(playerInfo.role.split('-')[0])) {
            document.getElementById('btn-self-destruct').classList.remove('hidden');
        } else {
            document.getElementById('btn-self-destruct').classList.add('hidden');
        }
        
        const btnDaySkill = document.getElementById('btn-day-skill');
        if (!playerInfo.isDead && playerInfo.role === '騎士' && !payload.isKnightUsed) {
            btnDaySkill.textContent = '發動騎士決鬥';
            btnDaySkill.classList.remove('hidden');
        } else {
            btnDaySkill.classList.add('hidden');
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
    }
    const targetSeatEl = document.getElementById(`player-targets-grid-seat-${payload.targetSeat}`);
    if (targetSeatEl) targetSeatEl.classList.add('dead');
}

function handleVoteResults(payload) {
    if (playerInfo.role === '定序王子' && !payload.isPrinceUsed) {
        const btnDaySkill = document.getElementById('btn-day-skill');
        btnDaySkill.textContent = '發動定序作廢投票';
        btnDaySkill.classList.remove('hidden');
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
    } else {
        UI.hideSpecialOptions();
    }

    document.getElementById('player-action-panel').classList.remove('hidden');
    UI.unlockPlayerInterface(roleDef.prompt);
    
    // 奇蹟商人防呆：強制隱藏跳過按鈕
    if (playerInfo.role === '奇蹟商人') {
        document.getElementById('btn-pass-action').classList.add('hidden');
    }
}

function onTargetSelect(seatNumber, seatEl) {
    switch (actionPayload.type) {
        case 'single_select': case 'single_select_dynamic': case 'dynamic_select':
            actionPayload.targets = [seatNumber];
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
            seatEl.classList.add('selected');
            document.getElementById('btn-confirm-action').disabled = false;
            break;
        case 'consensus': case 'consensus_dynamic':
            actionPayload.targets = [seatNumber];
            actionPayload.specialValue = null;
            
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => {
                s.classList.remove('selected');
                const w = s.querySelector('.seat-img-wrapper');
                if (w) {
                    if (s.classList.contains('wolf-selected')) {
                        w.style.borderColor = '#ffb703';
                        w.style.boxShadow = '0 0 15px rgba(255, 183, 3, 0.8)';
                    } else {
                        w.style.borderColor = '#555';
                        w.style.boxShadow = 'none';
                    }
                }
            });
            
            seatEl.classList.add('selected');
            const cw = seatEl.querySelector('.seat-img-wrapper');
            if (cw) {
                cw.style.borderColor = 'var(--accent-green)';
                cw.style.boxShadow = '0 0 15px var(--accent-green)';
            }
            
            document.querySelectorAll('#special-options-container .special-btn').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('btn-confirm-action').disabled = false;
            hostConnection.send({ type: 'WOLF_TARGET_PREVIEW', payload: { target: seatNumber } });
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
            // 商人防呆：禁止選擇自己
            if (playerInfo.role === '奇蹟商人' && seatNumber === playerInfo.seatNumber) {
                return alert('奇蹟商人不能將技能贈予給自己！');
            }
            if (!actionPayload.specialValue) return alert('請先於上方選擇要贈予的技能');
            actionPayload.targets = [seatNumber];
            document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => s.classList.remove('selected'));
            seatEl.classList.add('selected');
            document.getElementById('btn-confirm-action').disabled = false;
            break;
    }
}

function handleWolfPreview(previews) {
    document.querySelectorAll('.wolf-tag').forEach(el => el.remove());
    document.querySelectorAll('.player-seat').forEach(el => {
        el.classList.remove('wolf-selected');
        const w = el.querySelector('.seat-img-wrapper');
        if (w && !el.classList.contains('selected')) {
            w.style.borderColor = '#555';
            w.style.boxShadow = 'none';
        }
    });
    
    Object.values(previews).forEach(preview => {
        if(preview.seat !== playerInfo.seatNumber) {
            if (preview.target === 'pass') {
                // 將空刀標記掛在統一的「跳過」按鈕上
                const passBtn = document.getElementById('btn-pass-action');
                if (passBtn && !passBtn.classList.contains('hidden')) {
                    const tag = document.createElement('span');
                    tag.className = 'wolf-tag';
                    tag.style.position = 'absolute';
                    tag.style.top = '-10px';
                    tag.style.right = '-10px';
                    tag.style.background = '#ffb703';
                    tag.style.color = '#000';
                    tag.style.fontSize = '10px';
                    tag.style.padding = '2px 4px';
                    tag.style.borderRadius = '4px';
                    tag.style.fontWeight = 'bold';
                    tag.textContent = `${preview.seat}號 空刀`;
                    // 給按鈕 relative 以正確顯示標籤
                    passBtn.style.position = 'relative';
                    passBtn.appendChild(tag);
                }
            } else {
                const targetSeatEl = document.getElementById(`player-targets-grid-seat-${preview.target}`);
                if(targetSeatEl) {
                    targetSeatEl.classList.add('wolf-selected');
                    const w = targetSeatEl.querySelector('.seat-img-wrapper');
                    if (w && !targetSeatEl.classList.contains('selected')) {
                        w.style.borderColor = '#ffb703';
                        w.style.boxShadow = '0 0 15px rgba(255, 183, 3, 0.8)';
                    }
                    const tagContainer = targetSeatEl.querySelector('.wolf-tags-container');
                    if(tagContainer) {
                        const tag = document.createElement('div');
                        tag.className = 'wolf-tag';
                        tag.style.background = '#ffb703';
                        tag.style.color = '#000';
                        tag.style.fontSize = '10px';
                        tag.style.padding = '2px 4px';
                        tag.style.borderRadius = '4px';
                        tag.style.fontWeight = 'bold';
                        tag.style.whiteSpace = 'nowrap';
                        tag.textContent = `${preview.seat}號選擇`;
                        tagContainer.appendChild(tag);
                    }
                }
            }
        }
    });
}

function resetActionPayload() {
    actionPayload = { type: 'none', targets: [], specialValue: null, isDaySkill: false, isWWK: false };
    document.querySelectorAll('.player-seat').forEach(s => {
        s.classList.remove('selected', 'wolf-selected');
        const w = s.querySelector('.seat-img-wrapper');
        if(w) {
            w.style.borderColor = '#555';
            w.style.boxShadow = 'none';
        }
    });
    document.querySelectorAll('.wolf-tag').forEach(el => el.remove());
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
        if (playerInfo.role === '騎士') {
            if (confirm('確定要在現在發起決鬥嗎？')) {
                document.getElementById('btn-day-skill').classList.add('hidden');
                actionPayload.type = 'single_select';
                actionPayload.isDaySkill = true;
                document.getElementById('player-action-panel').classList.remove('hidden');
                UI.unlockPlayerInterface('請選擇你要決鬥的目標');
            }
        } else if (playerInfo.role === '定序王子') {
            if (confirm('確定要發動技能作廢本次投票嗎？\n(注意：必須在主持人按下「公告結果」後的 5 秒內發動才會生效)')) {
                document.getElementById('btn-day-skill').classList.add('hidden');
                hostConnection.send({ type: 'DAY_SKILL_ACTION', payload: { skill: 'prince' } });
            }
        }
    });

    document.getElementById('btn-confirm-action').addEventListener('click', () => {
        UI.lockPlayerInterface();
        if (actionPayload.isDaySkill) {
            hostConnection.send({ type: 'DAY_SKILL_ACTION', payload: { targets: actionPayload.targets } });
        } else if (actionPayload.isWWK) {
            hostConnection.send({ type: 'TRIGGER_SELF_DESTRUCT', payload: { target: actionPayload.targets[0] } });
        } else {
            hostConnection.send({ type: 'ACTION_COMPLETE', payload: { targets: actionPayload.targets, specialValue: actionPayload.specialValue } });
        }
        UI.hideSpecialOptions();
        document.getElementById('player-action-panel').classList.add('hidden');
        resetActionPayload();
    });

    document.getElementById('btn-pass-action')?.addEventListener('click', () => {
        UI.lockPlayerInterface();
        // 如果是狼人按下跳過，必須通知隊友是空刀
        if (['consensus', 'consensus_dynamic'].includes(actionPayload.type)) {
            hostConnection.send({ type: 'WOLF_TARGET_PREVIEW', payload: { target: 'pass' } });
        }
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
        if (playerInfo.role === '白狼王') {
            document.getElementById('btn-self-destruct').classList.add('hidden');
            actionPayload.type = 'single_select';
            actionPayload.isWWK = true;
            document.getElementById('player-action-panel').classList.remove('hidden');
            UI.unlockPlayerInterface('請選擇你要帶走的玩家');
        } else {
            if (confirm('確定要自爆嗎？')) {
                hostConnection.send({ type: 'TRIGGER_SELF_DESTRUCT', payload: {} });
                document.getElementById('btn-self-destruct').classList.add('hidden');
            }
        }
    });
});