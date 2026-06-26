// ==========================================
// v3.7 核心主機引擎 (Smart Server / Strategy Pattern)
// ==========================================

let hostPeer = null;
let connections = {};
let playersData = []; 
let currentRoomId = null;

let gameState = {
    phase: GAME_PHASE.LOBBY,
    nightCount: 0,
    nightSequence: [],       
    currentNightStepIndex: -1, 
    expectedActionCount: 0,  
    currentStepActions: [],  
    
    nightTags: { killed: [], poisoned: [], witchUsedSaveTonight: false },
    witchState: { antidoteUsed: false, poisonUsed: false },
    votes: {},
    pendingVoteTarget: null,
    pendingVoteTie: false,
    
    hunterOriginPhase: null, 
    systemLog: "等待遊戲開始..."
};

let wolfPreviews = {};

function isWolfRole(roleStr) {
    if (!roleStr) return false;
    return roleStr.startsWith('狼人');
}

// ==========================================
// [終極模組化] 角色技能外掛註冊表 (Role Plugins)
// ==========================================
const RolePlugins = {
    "狼人": {
        getPrompt: () => ROLE_DICTIONARY["狼人"].prompt,
        getSelectableSeats: () => playersData.filter(p => !p.isDead).map(p => p.seatNumber),
        getButtons: () => [
            { id: 'confirm', text: '確認襲擊', requiresTarget: true },
            { id: 'pass', text: '空刀', requiresTarget: false }
        ],
        getPassTags: (mySeat) => {
            let tags = [];
            Object.values(wolfPreviews).forEach(preview => {
                if (preview.target === 'pass' && preview.seat !== mySeat) tags.push(`${preview.seat}號`);
            });
            return tags;
        },
        resolve: (actions) => {
            let validTargets = [];
            actions.forEach(act => {
                if (act.actionId !== 'pass' && act.targets && act.targets.length > 0) validTargets.push(act.targets[0]);
            });
            if (validTargets.length === 0) return "【空刀】";
            
            const finalTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
            gameState.nightTags.killed.push(parseInt(finalTarget));
            return `【襲擊: ${finalTarget}號】`;
        }
    },
    "女巫": {
        getPrompt: () => {
            if (gameState.witchState.antidoteUsed) return "你的解藥已用過，無法得知刀口。 請選擇要發動的技能：";
            const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : "無";
            return `昨晚被襲擊的是 ${victim} 號。 請選擇要發動的技能：`;
        },
        getSelectableSeats: () => {
            if (gameState.witchState.antidoteUsed && gameState.witchState.poisonUsed) return [];
            return playersData.filter(p => !p.isDead).map(p => p.seatNumber);
        },
        getButtons: () => {
            let btns = [];
            if (!gameState.witchState.antidoteUsed) btns.push({ id: 'save', text: '使用解藥', requiresTarget: false });
            if (!gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) btns.push({ id: 'poison', text: '使用毒藥', requiresTarget: true });
            btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
            return btns;
        },
        getPassTags: () => [],
        resolve: (actions) => {
            const act = actions[0];
            const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
            if (act.actionId === 'save' && !gameState.witchState.antidoteUsed) {
                if (gameState.nightTags.killed.length > 0) {
                    gameState.nightTags.killed = []; 
                    gameState.nightTags.witchUsedSaveTonight = true;
                    gameState.witchState.antidoteUsed = true;
                    return "【解救】";
                }
                return "【無刀可救】";
            } else if (act.actionId === 'poison' && !gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) {
                if (target) {
                    gameState.nightTags.poisoned.push(target);
                    gameState.witchState.poisonUsed = true;
                    return `【毒殺: ${target}號】`;
                }
                return "【空毒】";
            }
            return "【跳過】";
        }
    },
    "預言家": {
        getPrompt: () => ROLE_DICTIONARY["預言家"].prompt,
        getSelectableSeats: () => playersData.filter(p => !p.isDead).map(p => p.seatNumber),
        getButtons: () => [
            { id: 'confirm', text: '確認查驗', requiresTarget: true },
            { id: 'pass', text: '跳過', requiresTarget: false }
        ],
        getPassTags: () => [],
        resolve: (actions) => {
            const act = actions[0];
            const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
            if (act.actionId === 'confirm' && target) {
                const tPlayer = playersData.find(p => p.seatNumber === target);
                const isWolf = isWolfRole(tPlayer.role);
                act.player.tempPrivateMessage = `系統提示：${target}號玩家為【${isWolf ? "狼人" : "好人"}】陣營。`;
                return `【查驗: ${target}號】`;
            }
            return "【跳過】";
        }
    }
};

// ==========================================
// 系統通訊與生命週期
// ==========================================

window.syncDeckToPlayers = function(deck) {
    let roleCounts = {};
    deck.forEach(r => roleCounts[r] = (roleCounts[r] || 0) + 1);
    broadcastToAll({ type: PACKET_TYPE.DECK_UPDATE, payload: { roleCounts: roleCounts } });
};

window.initHost = function(roomId) {
    hostPeer = new Peer(roomId, PEER_CONFIG);
    hostPeer.on('open', (id) => {
        document.getElementById('display-room-id').textContent = id;
        gameState.systemLog = '房間建立成功，等待玩家加入...';
        syncStateToAll();
    });
    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        setupHostConnectionListeners(conn);
    });
    hostPeer.on('error', () => { alert('建立房間失敗，可能是房間號碼已被使用。'); });
};

function setupHostConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case PACKET_TYPE.JOIN_ROOM: handlePlayerJoin(conn.peer, data.payload.name); break;
            case PACKET_TYPE.ACTION_SUBMIT: handleActionSubmit(conn.peer, data.payload); break;
            case PACKET_TYPE.VOTE_SUBMIT: handleVoteSubmit(conn.peer, data.payload); break;
            case PACKET_TYPE.WOLF_PREVIEW: handleWolfPreview(conn.peer, data.payload.target); break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    if (gameState.phase !== GAME_PHASE.LOBBY) return; 
    const seatNumber = playersData.length + 1;
    playersData.push({ seatNumber, peerId, name: playerName, role: null, isDead: false });
    if (connections[peerId]) connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber } });
    gameState.systemLog = `玩家 ${playerName} (${seatNumber}號) 已加入。`;
    syncStateToAll();
}

window.startGame = function(selectedRoles) {
    if (selectedRoles.length !== playersData.length) {
        alert(`角色數量(${selectedRoles.length})與玩家人數(${playersData.length})不符！`);
        return false;
    }
    
    let shuffledRoles = [...selectedRoles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }
    
    playersData.forEach((player, index) => { player.role = shuffledRoles[index]; });
    
    gameState.systemLog = '發牌完成，準備進入第一天夜晚...';
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(() => { startNightPhase(); }, 5000);
    return true; 
};

// ==========================================
// 狀態派發引擎 (完全無 if-else 角色硬編碼)
// ==========================================

function syncStateToAll() {
    const hostState = {
        systemLog: gameState.systemLog,
        players: playersData.map(p => ({ ...p })),
        layout: {
            showSetupPanel: gameState.phase === GAME_PHASE.LOBBY,
            showNightPanel: [GAME_PHASE.NIGHT_TRANSITION, GAME_PHASE.NIGHT_ACTION, GAME_PHASE.DAWN_SETTLEMENT].includes(gameState.phase),
            showDayPanel: [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_SETTLEMENT, GAME_PHASE.HUNTER_ACTION].includes(gameState.phase)
        },
        nightFlow: buildNightFlowForHost(),
        allowForceNext: gameState.phase === GAME_PHASE.NIGHT_ACTION,
        dayBtnText: getDayBtnText(),
        dayBtnDisabled: getDayBtnDisabled(),
        dayBtnCommand: getDayBtnCommand()
    };
    UI.renderHostView(hostState, handleHostCommand);

    playersData.forEach(player => {
        const playerState = buildStateForPlayer(player);
        if (connections[player.peerId]) connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: playerState });
    });
}

function buildStateForPlayer(player) {
    const mappedPlayers = playersData.map(p => {
        let visibleRole = null;
        let wolfTags = [];
        
        if (p.seatNumber === player.seatNumber) visibleRole = p.role;
        if (isWolfRole(player.role) && isWolfRole(p.role)) visibleRole = p.role;
        if (p.role === '白痴' && p.idiotRevealed) visibleRole = p.role;

        if (gameState.phase === GAME_PHASE.NIGHT_ACTION && gameState.nightSequence[gameState.currentNightStepIndex]?.roleName === "狼人" && isWolfRole(player.role)) {
            Object.values(wolfPreviews).forEach(preview => {
                if (preview.target === p.seatNumber && preview.seat !== player.seatNumber) wolfTags.push(`${preview.seat}號`);
            });
        }
        return { seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, roleInfo: visibleRole, wolfTags: wolfTags };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer();

    if (gameState.phase === GAME_PHASE.NIGHT_ACTION) {
        const currentStep = gameState.nightSequence[gameState.currentNightStepIndex];
        const isMyTurn = currentStep && currentStep.activePlayers.some(ap => ap.seatNumber === player.seatNumber);
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (isMyTurn && !player.isDead) {
            if (hasActed) {
                actionPanel.show = true;
                actionPanel.prompt = (currentStep.roleName === "狼人") ? "等待隊友決定目標..." : "行動已送出，等待系統結算...";
            } else {
                // [終極模組化實踐] 動態呼叫外掛，核心引擎完全不知道現在是誰
                const plugin = RolePlugins[currentStep.roleName];
                actionPanel.show = true;
                actionPanel.type = currentStep.roleDef.actionType;
                actionPanel.prompt = plugin ? plugin.getPrompt() : "請行動：";
                actionPanel.selectableSeats = plugin ? plugin.getSelectableSeats() : [];
                actionPanel.buttons = plugin ? plugin.getButtons() : [];
                actionPanel.passTags = plugin ? plugin.getPassTags(player.seatNumber) : [];
                actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;
            }
        }
    } 
    else if (gameState.phase === GAME_PHASE.DAY_VOTING) {
        const hasVoted = gameState.votes[player.seatNumber] !== undefined;
        if (!player.isDead) {
            actionPanel.show = true;
            if (hasVoted) {
                actionPanel.prompt = "你已經投票完成，等待其他玩家投票...";
            } else {
                actionPanel.type = 'single_select'; 
                actionPanel.prompt = '請選擇放逐投票的目標：';
                actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
                actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
                actionPanel.buttons = [
                    { id: 'vote', text: '投票', requiresTarget: true },
                    { id: 'pass', text: '棄票', requiresTarget: false }
                ];
            }
        }
    }
    else if (gameState.phase === GAME_PHASE.HUNTER_ACTION) {
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        if (player.role === '獵人') {
            actionPanel.show = true;
            if (hasActed) {
                actionPanel.prompt = "開槍決定已送出，等待系統結算...";
            } else {
                actionPanel.type = 'single_select';
                actionPanel.prompt = '你已死亡，請選擇要開槍帶走的目標：';
                actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
                actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;
                actionPanel.buttons = [
                    { id: 'shoot', text: '開槍', requiresTarget: true },
                    { id: 'pass', text: '不開槍', requiresTarget: false }
                ];
            }
        }
    }

    if (player.tempPrivateMessage) {
        personalMessage += "\n" + player.tempPrivateMessage;
        player.tempPrivateMessage = null; 
    }

    return {
        phase: gameState.phase,
        mySeat: player.seatNumber,
        myRole: player.role,
        message: personalMessage,
        players: mappedPlayers,
        actionPanel: actionPanel
    };
}

function getPhaseMessageForPlayer() {
    switch(gameState.phase) {
        case GAME_PHASE.NIGHT_TRANSITION: return "天黑請閉眼...";
        case GAME_PHASE.NIGHT_ACTION: return "夜間行動中，請等待...";
        case GAME_PHASE.DAWN_SETTLEMENT: return "天亮結算中，請等待...";
        case GAME_PHASE.DAY_DISCUSSION: return "白天發言階段。";
        case GAME_PHASE.DAY_VOTING: return "正在進行放逐投票...";
        case GAME_PHASE.VOTE_SETTLEMENT: return "投票結算中，請等待...";
        case GAME_PHASE.HUNTER_ACTION: return "等待獵人發動技能..."; 
        default: return "等待中...";
    }
}

// ==========================================
// 結算與流程控制器
// ==========================================

function startNightPhase() {
    gameState.nightCount++;
    gameState.phase = GAME_PHASE.NIGHT_ACTION;
    gameState.systemLog = `進入第 ${gameState.nightCount} 夜。`;
    gameState.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
    gameState.currentStepActions = [];
    wolfPreviews = {};
    gameState.nightSequence = buildNightSequence();
    gameState.currentNightStepIndex = -1;
    nextNightStep();
}

function buildNightSequence() {
    let sequence = [];
    const alivePlayers = playersData.filter(p => !p.isDead);
    
    for (let order = 1; order <= 20; order++) {
        if (order === 11) {
            const aliveWolves = alivePlayers.filter(p => isWolfRole(p.role));
            if (aliveWolves.length > 0) {
                sequence.push({ order: 11, roleName: "狼人", activePlayers: aliveWolves, roleDef: ROLE_DICTIONARY["狼人"], resultLog: "等待行動..." });
            }
            continue;
        }
        for (const [rName, rDef] of Object.entries(ROLE_DICTIONARY)) {
            if (rDef.wakeOrder === order) {
                const baseRole = rName.split('-')[0];
                const matchingPlayers = alivePlayers.filter(p => p.role === baseRole);
                if (matchingPlayers.length > 0) sequence.push({ order: order, roleName: rName, activePlayers: matchingPlayers, roleDef: rDef, resultLog: "等待行動..." });
            }
        }
    }
    return sequence;
}

function nextNightStep() {
    gameState.currentNightStepIndex++;
    if (gameState.currentNightStepIndex >= gameState.nightSequence.length) {
        gameState.phase = GAME_PHASE.DAWN_SETTLEMENT;
        gameState.systemLog = `夜間行動完畢。請查看上方結果，並按下「進入白天並發布死訊」。`;
        syncStateToAll();
        return;
    }
    const step = gameState.nightSequence[gameState.currentNightStepIndex];
    gameState.expectedActionCount = step.activePlayers.length;
    gameState.currentStepActions = [];
    wolfPreviews = {};
    gameState.systemLog = `正在等待【${step.roleName}】行動...`;
    syncStateToAll();
}

function handleWolfPreview(peerId, targetSeat) {
    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    const p = playersData.find(x => x.peerId === peerId);
    if (!p) return;
    wolfPreviews[peerId] = { seat: p.seatNumber, target: targetSeat };
    syncStateToAll(); 
}

function handleActionSubmit(peerId, payload) {
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    if (!actingPlayer) return;
    if (gameState.currentStepActions.some(act => act.player.seatNumber === actingPlayer.seatNumber)) return;

    if (gameState.phase === GAME_PHASE.HUNTER_ACTION && actingPlayer.role === '獵人') {
        const target = payload.targets && payload.targets.length > 0 ? payload.targets[0] : null;
        if (payload.actionId === 'shoot' && target) {
            const tPlayer = playersData.find(p => p.seatNumber === target);
            if (tPlayer) tPlayer.isDead = true;
            gameState.systemLog = `獵人開槍帶走了 ${target} 號玩家。`;
            broadcastTempMessage(`獵人開槍帶走了 ${target} 號玩家。`);
        } else {
            gameState.systemLog = `獵人選擇不開槍。`;
            broadcastTempMessage(`獵人選擇不開槍。`);
        }
        
        gameState.phase = gameState.hunterOriginPhase;
        syncStateToAll();

        if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) setTimeout(autoTransitionToNight, 5000);
        return;
    }

    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    gameState.currentStepActions.push({ player: actingPlayer, targets: payload.targets || [], actionId: payload.actionId });
    gameState.expectedActionCount--;

    if (gameState.expectedActionCount <= 0) {
        const step = gameState.nightSequence[gameState.currentNightStepIndex];
        const plugin = RolePlugins[step.roleName];
        
        // [終極模組化實踐] 交由外掛結算結果
        if (plugin) {
            step.resultLog = plugin.resolve(gameState.currentStepActions);
        } else {
            step.resultLog = "【未定義結算模組】";
        }
        
        setTimeout(nextNightStep, 1000); 
    } else {
        syncStateToAll(); 
    }
}

function processDawn() {
    let deadThisNight = [];
    let hunterDied = false;

    playersData.forEach(p => {
        if (p.isDead) return;
        const seat = p.seatNumber;
        let isDying = gameState.nightTags.killed.includes(seat) || gameState.nightTags.poisoned.includes(seat);
        
        if (isDying) {
            p.isDead = true;
            deadThisNight.push(seat);
            if (p.role === '獵人') hunterDied = true;
        }
    });

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(', ')} 號玩家死亡。` : `昨晚是平安夜。`;
    gameState.systemLog = msg;
    broadcastTempMessage(msg);

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        gameState.hunterOriginPhase = GAME_PHASE.DAY_DISCUSSION; 
    } else {
        gameState.phase = GAME_PHASE.DAY_DISCUSSION;
    }
    syncStateToAll();
}

function handleVoteSubmit(peerId, payload) {
    if (gameState.phase !== GAME_PHASE.DAY_VOTING) return;
    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead || gameState.votes[voter.seatNumber] !== undefined) return;

    const target = (payload.actionId === 'vote' && payload.targets && payload.targets.length > 0) ? payload.targets[0] : 'pass';
    gameState.votes[voter.seatNumber] = target;

    const aliveCount = playersData.filter(p => !p.isDead).length;
    const votedCount = Object.keys(gameState.votes).length;

    gameState.systemLog = `投票進度：${votedCount} / ${aliveCount}`;

    if (votedCount >= aliveCount) resolveVoting();
    else syncStateToAll();
}

function resolveVoting() {
    let voteCounts = {};
    Object.values(gameState.votes).forEach(t => {
        if (t !== 'pass') voteCounts[t] = (voteCounts[t] || 0) + 1;
    });

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;
    let hunterDied = false;

    for (const [t, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    if (isTie || !finalTarget) {
        gameState.systemLog = "平票或全數棄票，無人出局。";
        broadcastTempMessage("平票或全數棄票，無人出局。");
    } else {
        const tPlayer = playersData.find(p => p.seatNumber === finalTarget);
        if (tPlayer.role === '白痴' && !tPlayer.idiotRevealed) {
            tPlayer.idiotRevealed = true;
            gameState.systemLog = `${finalTarget} 號最高票，觸發【白痴】翻牌，免除出局。`;
            broadcastTempMessage(`【白痴】翻牌！${finalTarget} 號免除出局。`);
        } else {
            tPlayer.isDead = true;
            if (tPlayer.role === '獵人') hunterDied = true;
            gameState.systemLog = `${finalTarget} 號被放逐出局。`;
            broadcastTempMessage(`${finalTarget} 號被放逐出局。`);
        }
    }

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        gameState.hunterOriginPhase = GAME_PHASE.VOTE_SETTLEMENT;
        syncStateToAll();
    } else {
        gameState.phase = GAME_PHASE.VOTE_SETTLEMENT;
        syncStateToAll();
        setTimeout(autoTransitionToNight, 5000);
    }
}

function autoTransitionToNight() {
    if (gameState.phase !== GAME_PHASE.VOTE_SETTLEMENT) return;
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(startNightPhase, 3000);
}

function broadcastTempMessage(msg) {
    playersData.forEach(p => p.tempPrivateMessage = msg);
}

function buildNightFlowForHost() {
    return gameState.nightSequence.map((step, idx) => {
        let status = 'pending';
        if (idx < gameState.currentNightStepIndex) status = 'completed';
        if (idx === gameState.currentNightStepIndex) status = 'active';
        return { title: `${step.order}. ${step.roleName}`, status: status, result: step.resultLog };
    });
}

function getDayBtnText() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "發起放逐投票";
    if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) return "結算中，5秒後即將天黑..."; 
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "進入白天並發布死訊";
    if (gameState.phase === GAME_PHASE.HUNTER_ACTION) return "等待獵人開槍...";
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return [GAME_PHASE.DAY_VOTING, GAME_PHASE.HUNTER_ACTION, GAME_PHASE.VOTE_SETTLEMENT].includes(gameState.phase);
}

function getDayBtnCommand() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "START_VOTE";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "PROCESS_DAWN"; 
    return "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT') {
        const step = gameState.nightSequence[gameState.currentNightStepIndex];
        const plugin = RolePlugins[step.roleName];
        step.resultLog = plugin ? plugin.resolve(gameState.currentStepActions) : "【強制跳過】";
        nextNightStep();
    } else if (cmd === 'START_VOTE') {
        gameState.phase = GAME_PHASE.DAY_VOTING;
        gameState.votes = {};
        gameState.systemLog = "正在進行放逐投票...";
        syncStateToAll();
    } else if (cmd === 'PROCESS_DAWN') {
        processDawn();
    }
}

function broadcastToAll(data) { playersData.forEach(p => { if (connections[p.peerId]) connections[p.peerId].send(data); }); }// ==========================================
// v3.6.1 核心主機引擎 (Smart Server / State Machine)
// ==========================================

let hostPeer = null;
let connections = {};
let playersData = []; 
let currentRoomId = null;

let gameState = {
    phase: GAME_PHASE.LOBBY,
    nightCount: 0,
    nightSequence: [],       
    currentNightStepIndex: -1, 
    expectedActionCount: 0,  
    currentStepActions: [],  
    
    nightTags: { killed: [], poisoned: [], witchUsedSaveTonight: false },
    witchState: { antidoteUsed: false, poisonUsed: false },
    votes: {},
    pendingVoteTarget: null,
    pendingVoteTie: false,
    
    hunterOriginPhase: null, 
    systemLog: "等待遊戲開始..."
};

let wolfPreviews = {};

function isWolfRole(roleStr) {
    if (!roleStr) return false;
    return roleStr.startsWith('狼人');
}

function resolvePrompt(roleName) {
    if (roleName === "女巫") {
        let msg = "";
        if (gameState.witchState.antidoteUsed) {
            msg += "你的解藥已用過，無法得知刀口。";
        } else {
            const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : "無";
            msg += `昨晚被襲擊的是 ${victim} 號。`;
        }
        return msg + " 請選擇要發動的技能：";
    }
    return ROLE_DICTIONARY[roleName]?.prompt || "請行動：";
}

function getSelectableSeats(roleName) {
    if (roleName === "女巫" && gameState.witchState.antidoteUsed && gameState.witchState.poisonUsed) return [];
    return playersData.filter(p => !p.isDead).map(p => p.seatNumber);
}

window.syncDeckToPlayers = function(deck) {
    let roleCounts = {};
    deck.forEach(r => roleCounts[r] = (roleCounts[r] || 0) + 1);
    broadcastToAll({ type: PACKET_TYPE.DECK_UPDATE, payload: { roleCounts: roleCounts } });
};

window.initHost = function(roomId) {
    hostPeer = new Peer(roomId, PEER_CONFIG);
    hostPeer.on('open', (id) => {
        document.getElementById('display-room-id').textContent = id;
        gameState.systemLog = '房間建立成功，等待玩家加入...';
        syncStateToAll();
    });
    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        setupHostConnectionListeners(conn);
    });
    hostPeer.on('error', (err) => { alert('建立房間失敗，可能是房間號碼已被使用。'); });
};

function setupHostConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case PACKET_TYPE.JOIN_ROOM: handlePlayerJoin(conn.peer, data.payload.name); break;
            case PACKET_TYPE.ACTION_SUBMIT: handleActionSubmit(conn.peer, data.payload); break;
            case PACKET_TYPE.VOTE_SUBMIT: handleVoteSubmit(conn.peer, data.payload); break;
            case PACKET_TYPE.WOLF_PREVIEW: handleWolfPreview(conn.peer, data.payload.target); break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    if (gameState.phase !== GAME_PHASE.LOBBY) return; 
    const seatNumber = playersData.length + 1;
    playersData.push({ seatNumber, peerId, name: playerName, role: null, isDead: false });
    if (connections[peerId]) connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber } });
    gameState.systemLog = `玩家 ${playerName} (${seatNumber}號) 已加入。`;
    syncStateToAll();
}

window.startGame = function(selectedRoles) {
    if (selectedRoles.length !== playersData.length) {
        alert(`角色數量(${selectedRoles.length})與玩家人數(${playersData.length})不符！`);
        return false;
    }
    
    let shuffledRoles = [...selectedRoles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }
    
    playersData.forEach((player, index) => { player.role = shuffledRoles[index]; });
    
    gameState.systemLog = '發牌完成，準備進入第一天夜晚...';
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(() => { startNightPhase(); }, 5000);
    return true; 
};

function syncStateToAll() {
    const hostState = {
        systemLog: gameState.systemLog,
        players: playersData.map(p => ({ ...p })),
        layout: {
            showSetupPanel: gameState.phase === GAME_PHASE.LOBBY,
            showNightPanel: [GAME_PHASE.NIGHT_TRANSITION, GAME_PHASE.NIGHT_ACTION, GAME_PHASE.DAWN_SETTLEMENT].includes(gameState.phase),
            showDayPanel: [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_SETTLEMENT, GAME_PHASE.HUNTER_ACTION].includes(gameState.phase)
        },
        nightFlow: buildNightFlowForHost(),
        allowForceNext: gameState.phase === GAME_PHASE.NIGHT_ACTION,
        dayBtnText: getDayBtnText(),
        dayBtnDisabled: getDayBtnDisabled(),
        dayBtnCommand: getDayBtnCommand()
    };
    UI.renderHostView(hostState, handleHostCommand);

    playersData.forEach(player => {
        const playerState = buildStateForPlayer(player);
        if (connections[player.peerId]) connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: playerState });
    });
}

function buildStateForPlayer(player) {
    const mappedPlayers = playersData.map(p => {
        let visibleRole = null;
        let wolfTags = [];
        
        if (p.seatNumber === player.seatNumber) visibleRole = p.role;
        if (isWolfRole(player.role) && isWolfRole(p.role)) visibleRole = p.role;
        if (p.role === '白痴' && p.idiotRevealed) visibleRole = p.role;

        if (gameState.phase === GAME_PHASE.NIGHT_ACTION && gameState.nightSequence[gameState.currentNightStepIndex]?.roleName === "狼人" && isWolfRole(player.role)) {
            Object.values(wolfPreviews).forEach(preview => {
                if (preview.target === p.seatNumber && preview.seat !== player.seatNumber) wolfTags.push(`${preview.seat}號`);
            });
        }
        return { seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, roleInfo: visibleRole, wolfTags: wolfTags };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer();

    if (gameState.phase === GAME_PHASE.NIGHT_ACTION) {
        const currentStep = gameState.nightSequence[gameState.currentNightStepIndex];
        const isMyTurn = currentStep && currentStep.activePlayers.some(ap => ap.seatNumber === player.seatNumber);
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (isMyTurn && !player.isDead) {
            if (hasActed) {
                actionPanel.show = true;
                actionPanel.prompt = (currentStep.roleName === "狼人") ? "等待隊友決定目標..." : "行動已送出，等待系統結算...";
                actionPanel.selectableSeats = [];
                actionPanel.buttons = []; 
            } else {
                actionPanel.show = true;
                actionPanel.type = currentStep.roleDef.actionType;
                actionPanel.prompt = resolvePrompt(currentStep.roleName);
                actionPanel.selectableSeats = getSelectableSeats(currentStep.roleName);
                actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;

                if (currentStep.roleName === "女巫") {
                    if (!gameState.witchState.antidoteUsed) {
                        actionPanel.buttons.push({ id: 'save', text: '使用解藥', requiresTarget: false });
                    }
                    if (!gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) {
                        actionPanel.buttons.push({ id: 'poison', text: '使用毒藥', requiresTarget: true });
                    }
                    actionPanel.buttons.push({ id: 'pass', text: '跳過', requiresTarget: false });
                } else if (currentStep.roleName === "狼人") {
                    actionPanel.buttons = [
                        { id: 'confirm', text: '確認襲擊', requiresTarget: true },
                        { id: 'pass', text: '空刀', requiresTarget: false }
                    ];
                    let passTags = [];
                    Object.values(wolfPreviews).forEach(preview => {
                        if (preview.target === 'pass' && preview.seat !== player.seatNumber) passTags.push(`${preview.seat}號`);
                    });
                    actionPanel.passTags = passTags; 
                } else {
                    actionPanel.buttons = [
                        { id: 'confirm', text: '確認', requiresTarget: true },
                        { id: 'pass', text: '跳過', requiresTarget: false }
                    ];
                }
            }
        }
    } 
    else if (gameState.phase === GAME_PHASE.DAY_VOTING) {
        const hasVoted = gameState.votes[player.seatNumber] !== undefined;
        if (!player.isDead) {
            if (hasVoted) {
                actionPanel.show = true;
                actionPanel.prompt = "你已經投票完成，等待其他玩家投票...";
                actionPanel.selectableSeats = [];
                actionPanel.buttons = [];
            } else {
                actionPanel.show = true;
                actionPanel.type = 'single_select'; 
                actionPanel.prompt = '請選擇放逐投票的目標：';
                actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
                actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
                actionPanel.buttons = [
                    { id: 'vote', text: '投票', requiresTarget: true },
                    { id: 'pass', text: '棄票', requiresTarget: false }
                ];
            }
        }
    }
    else if (gameState.phase === GAME_PHASE.HUNTER_ACTION) {
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        if (player.role === '獵人') {
            if (hasActed) {
                actionPanel.show = true;
                actionPanel.prompt = "開槍決定已送出，等待系統結算...";
                actionPanel.selectableSeats = [];
                actionPanel.buttons = [];
            } else {
                actionPanel.show = true;
                actionPanel.type = 'single_select';
                actionPanel.prompt = '你已死亡，請選擇要開槍帶走的目標：';
                actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
                actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;
                actionPanel.buttons = [
                    { id: 'shoot', text: '開槍', requiresTarget: true },
                    { id: 'pass', text: '不開槍', requiresTarget: false }
                ];
            }
        }
    }

    if (player.tempPrivateMessage) {
        personalMessage += "\n" + player.tempPrivateMessage;
        player.tempPrivateMessage = null; 
    }

    return {
        phase: gameState.phase,
        mySeat: player.seatNumber,
        myRole: player.role,
        message: personalMessage,
        players: mappedPlayers,
        actionPanel: actionPanel
    };
}

function getPhaseMessageForPlayer() {
    switch(gameState.phase) {
        case GAME_PHASE.NIGHT_TRANSITION: return "天黑請閉眼...";
        case GAME_PHASE.NIGHT_ACTION: return "夜間行動中，請等待...";
        case GAME_PHASE.DAWN_SETTLEMENT: return "天亮結算中，請等待...";
        case GAME_PHASE.DAY_DISCUSSION: return "白天發言階段。";
        case GAME_PHASE.DAY_VOTING: return "正在進行放逐投票...";
        case GAME_PHASE.VOTE_SETTLEMENT: return "投票結算中，請等待...";
        case GAME_PHASE.HUNTER_ACTION: return "等待獵人發動技能..."; 
        default: return "等待中...";
    }
}

function startNightPhase() {
    gameState.nightCount++;
    gameState.phase = GAME_PHASE.NIGHT_ACTION;
    gameState.systemLog = `進入第 ${gameState.nightCount} 夜。`;
    gameState.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
    gameState.currentStepActions = [];
    wolfPreviews = {};
    gameState.nightSequence = buildNightSequence();
    gameState.currentNightStepIndex = -1;
    nextNightStep();
}

function buildNightSequence() {
    let sequence = [];
    const alivePlayers = playersData.filter(p => !p.isDead);
    
    for (let order = 1; order <= 20; order++) {
        if (order === 11) {
            const aliveWolves = alivePlayers.filter(p => isWolfRole(p.role));
            if (aliveWolves.length > 0) {
                sequence.push({ order: 11, roleName: "狼人", activePlayers: aliveWolves, roleDef: ROLE_DICTIONARY["狼人"], resultLog: "等待行動..." });
            }
            continue;
        }
        for (const [rName, rDef] of Object.entries(ROLE_DICTIONARY)) {
            if (rDef.wakeOrder === order) {
                const baseRole = rName.split('-')[0];
                const matchingPlayers = alivePlayers.filter(p => p.role === baseRole);
                if (matchingPlayers.length > 0) sequence.push({ order: order, roleName: rName, activePlayers: matchingPlayers, roleDef: rDef, resultLog: "等待行動..." });
            }
        }
    }
    return sequence;
}

function nextNightStep() {
    gameState.currentNightStepIndex++;
    if (gameState.currentNightStepIndex >= gameState.nightSequence.length) {
        gameState.phase = GAME_PHASE.DAWN_SETTLEMENT;
        gameState.systemLog = `夜間行動完畢。請查看上方結果，並按下「進入白天並發布死訊」。`;
        syncStateToAll();
        return;
    }
    const step = gameState.nightSequence[gameState.currentNightStepIndex];
    gameState.expectedActionCount = step.activePlayers.length;
    gameState.currentStepActions = [];
    wolfPreviews = {};
    gameState.systemLog = `正在等待【${step.roleName}】行動...`;
    syncStateToAll();
}

function handleWolfPreview(peerId, targetSeat) {
    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    const p = playersData.find(x => x.peerId === peerId);
    if (!p) return;
    wolfPreviews[peerId] = { seat: p.seatNumber, target: targetSeat };
    syncStateToAll(); 
}

function handleActionSubmit(peerId, payload) {
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    if (!actingPlayer) return;

    // [修復攔截] 防止重複點擊造成預期行動數(expectedActionCount)變成負數
    if (gameState.currentStepActions.some(act => act.player.seatNumber === actingPlayer.seatNumber)) return;

    if (gameState.phase === GAME_PHASE.HUNTER_ACTION && actingPlayer.role === '獵人') {
        const target = payload.targets && payload.targets.length > 0 ? payload.targets[0] : null;
        if (payload.actionId === 'shoot' && target) {
            const tPlayer = playersData.find(p => p.seatNumber === target);
            if (tPlayer) tPlayer.isDead = true;
            gameState.systemLog = `獵人開槍帶走了 ${target} 號玩家。`;
            broadcastTempMessage(`獵人開槍帶走了 ${target} 號玩家。`);
        } else {
            gameState.systemLog = `獵人選擇不開槍。`;
            broadcastTempMessage(`獵人選擇不開槍。`);
        }
        
        gameState.phase = gameState.hunterOriginPhase;
        syncStateToAll();

        if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) {
            setTimeout(autoTransitionToNight, 5000);
        }
        return;
    }

    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    gameState.currentStepActions.push({ player: actingPlayer, targets: payload.targets || [], actionId: payload.actionId });
    gameState.expectedActionCount--;

    if (gameState.expectedActionCount <= 0) {
        resolveNightStep();
        setTimeout(nextNightStep, 1000); 
    } else {
        syncStateToAll(); 
    }
}

function resolveNightStep() {
    const step = gameState.nightSequence[gameState.currentNightStepIndex];
    let resultText = "【未行動】";

    if (step.roleName === "狼人") {
        let validTargets = [];
        gameState.currentStepActions.forEach(act => {
            if (act.actionId !== 'pass' && act.targets && act.targets.length > 0) {
                validTargets.push(act.targets[0]);
            }
        });

        let finalTarget = 'pass';
        if (validTargets.length > 0) {
            const randomIndex = Math.floor(Math.random() * validTargets.length);
            finalTarget = validTargets[randomIndex];
        }

        if (finalTarget === 'pass') {
            resultText = "【空刀】";
        } else {
            resultText = `【襲擊: ${finalTarget}號】`;
            gameState.nightTags.killed.push(parseInt(finalTarget));
        }
    } 
    else {
        const act = gameState.currentStepActions[0];
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;

        switch (step.roleName) {
            case "女巫":
                if (act.actionId === 'save' && !gameState.witchState.antidoteUsed) {
                    if (gameState.nightTags.killed.length > 0) {
                        gameState.nightTags.killed = []; 
                        gameState.nightTags.witchUsedSaveTonight = true;
                        gameState.witchState.antidoteUsed = true;
                        resultText = `【解救】`;
                    } else {
                        resultText = `【無刀可救】`;
                    }
                } else if (act.actionId === 'poison' && !gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) {
                    if (target) {
                        gameState.nightTags.poisoned.push(target);
                        gameState.witchState.poisonUsed = true;
                        resultText = `【毒殺: ${target}號】`;
                    } else {
                        resultText = "【空毒】";
                    }
                } else {
                    resultText = "【跳過】";
                }
                break;
            case "預言家":
                if (act.actionId === 'confirm' && target) {
                    resultText = `【查驗: ${target}號】`;
                    const tPlayer = playersData.find(p => p.seatNumber === target);
                    const isWolf = isWolfRole(tPlayer.role);
                    act.player.tempPrivateMessage = `系統提示：${target}號玩家為【${isWolf ? "狼人" : "好人"}】陣營。`;
                } else resultText = "【跳過】";
                break;
        }
    }
    step.resultLog = resultText;
}

function processDawn() {
    let deadThisNight = [];
    let hunterDied = false;

    playersData.forEach(p => {
        if (p.isDead) return;
        const seat = p.seatNumber;
        let isDying = gameState.nightTags.killed.includes(seat) || gameState.nightTags.poisoned.includes(seat);
        
        if (isDying) {
            p.isDead = true;
            deadThisNight.push(seat);
            if (p.role === '獵人') hunterDied = true;
        }
    });

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(', ')} 號玩家死亡。` : `昨晚是平安夜。`;
    gameState.systemLog = msg;
    broadcastTempMessage(msg);

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        gameState.hunterOriginPhase = GAME_PHASE.DAY_DISCUSSION; 
    } else {
        gameState.phase = GAME_PHASE.DAY_DISCUSSION;
    }
    syncStateToAll();
}

function handleVoteSubmit(peerId, payload) {
    if (gameState.phase !== GAME_PHASE.DAY_VOTING) return;
    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead) return;

    // 針對重複投票的安全攔截
    if (gameState.votes[voter.seatNumber] !== undefined) return;

    const target = (payload.actionId === 'vote' && payload.targets && payload.targets.length > 0) ? payload.targets[0] : 'pass';
    gameState.votes[voter.seatNumber] = target;

    const aliveCount = playersData.filter(p => !p.isDead).length;
    const votedCount = Object.keys(gameState.votes).length;

    gameState.systemLog = `投票進度：${votedCount} / ${aliveCount}`;

    if (votedCount >= aliveCount) resolveVoting();
    else syncStateToAll();
}

function resolveVoting() {
    let voteCounts = {};
    Object.values(gameState.votes).forEach(t => {
        if (t !== 'pass') voteCounts[t] = (voteCounts[t] || 0) + 1;
    });

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;
    let hunterDied = false;

    for (const [t, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    if (isTie || !finalTarget) {
        gameState.systemLog = "平票或全數棄票，無人出局。";
        broadcastTempMessage("平票或全數棄票，無人出局。");
    } else {
        const tPlayer = playersData.find(p => p.seatNumber === finalTarget);
        if (tPlayer.role === '白痴' && !tPlayer.idiotRevealed) {
            tPlayer.idiotRevealed = true;
            gameState.systemLog = `${finalTarget} 號最高票，觸發【白痴】翻牌，免除出局。`;
            broadcastTempMessage(`【白痴】翻牌！${finalTarget} 號免除出局。`);
        } else {
            tPlayer.isDead = true;
            if (tPlayer.role === '獵人') hunterDied = true;
            gameState.systemLog = `${finalTarget} 號被放逐出局。`;
            broadcastTempMessage(`${finalTarget} 號被放逐出局。`);
        }
    }

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        gameState.hunterOriginPhase = GAME_PHASE.VOTE_SETTLEMENT;
        syncStateToAll();
    } else {
        gameState.phase = GAME_PHASE.VOTE_SETTLEMENT;
        syncStateToAll();
        setTimeout(autoTransitionToNight, 5000);
    }
}

function autoTransitionToNight() {
    if (gameState.phase !== GAME_PHASE.VOTE_SETTLEMENT) return;
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(startNightPhase, 3000);
}

function broadcastTempMessage(msg) {
    playersData.forEach(p => p.tempPrivateMessage = msg);
}

function buildNightFlowForHost() {
    return gameState.nightSequence.map((step, idx) => {
        let status = 'pending';
        if (idx < gameState.currentNightStepIndex) status = 'completed';
        if (idx === gameState.currentNightStepIndex) status = 'active';
        return { title: `${step.order}. ${step.roleName}`, status: status, result: step.resultLog };
    });
}

function getDayBtnText() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "發起放逐投票";
    if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) return "結算中，5秒後即將天黑..."; 
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "進入白天並發布死訊";
    if (gameState.phase === GAME_PHASE.HUNTER_ACTION) return "等待獵人開槍...";
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return [GAME_PHASE.DAY_VOTING, GAME_PHASE.HUNTER_ACTION, GAME_PHASE.VOTE_SETTLEMENT].includes(gameState.phase);
}

function getDayBtnCommand() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "START_VOTE";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "PROCESS_DAWN"; 
    return "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT') {
        resolveNightStep();
        nextNightStep();
    } else if (cmd === 'START_VOTE') {
        gameState.phase = GAME_PHASE.DAY_VOTING;
        gameState.votes = {};
        gameState.systemLog = "正在進行放逐投票...";
        syncStateToAll();
    } else if (cmd === 'PROCESS_DAWN') {
        processDawn();
    }
}

function broadcastToAll(data) { playersData.forEach(p => { if (connections[p.peerId]) connections[p.peerId].send(data); }); }