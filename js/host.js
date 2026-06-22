// ==========================================
// v3.0 核心主機引擎 (Smart Server / State Machine)
// ==========================================

let hostPeer = null;
let connections = {};
let playersData = []; // { seatNumber, peerId, name, role, isDead }

// 全域狀態機 (Global State)
let gameState = {
    phase: GAME_PHASE.LOBBY,
    nightCount: 0,
    nightSequence: [],       // 今晚的行動順序
    currentNightStepIndex: -1, 
    expectedActionCount: 0,  // 等待幾個玩家送出行動
    currentStepActions: [],  // 暫存當前步驟收到的行動
    
    // 結算標籤
    nightTags: {
        killed: [],
        poisoned: [],
        witchUsedSaveTonight: false
    },
    
    // 角色全域狀態
    witchState: {
        antidoteUsed: false,
        poisonUsed: false
    },
    
    // 投票狀態
    votes: {},
    pendingVoteTarget: null,
    pendingVoteTie: false,
    
    systemLog: "等待遊戲開始..."
};

// 輔助函式：判斷是否為狼人
function isWolfRole(roleStr) {
    if (!roleStr) return false;
    return roleStr.startsWith('狼人');
}

// 實時同步牌堆
window.syncDeckToPlayers = function(deck) {
    let roleCounts = {};
    deck.forEach(r => roleCounts[r] = (roleCounts[r] || 0) + 1);
    broadcastToAll({ type: PACKET_TYPE.DECK_UPDATE, payload: { roleCounts: roleCounts } });
};

// 初始化主機
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
    hostPeer.on('error', (err) => {
        alert('建立房間失敗，可能是房間號碼已被使用。');
    });
};

function setupHostConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case PACKET_TYPE.JOIN_ROOM: 
                handlePlayerJoin(conn.peer, data.payload.name); 
                break;
            case PACKET_TYPE.ACTION_SUBMIT: 
                handleActionSubmit(conn.peer, data.payload); 
                break;
            case PACKET_TYPE.VOTE_SUBMIT: 
                handleVoteSubmit(conn.peer, data.payload); 
                break;
            case PACKET_TYPE.WOLF_PREVIEW: 
                handleWolfPreview(conn.peer, data.payload.target); 
                break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    if (gameState.phase !== GAME_PHASE.LOBBY) return; // 遊戲開始後禁止加入
    
    const seatNumber = playersData.length + 1;
    playersData.push({ seatNumber, peerId, name: playerName, role: null, isDead: false });
    
    // 告知玩家加入成功
    if (connections[peerId]) {
        connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber } });
    }
    
    gameState.systemLog = `玩家 ${playerName} (${seatNumber}號) 已加入。`;
    syncStateToAll();
}

window.startGame = function(selectedRoles) {
    if (selectedRoles.length !== playersData.length) {
        alert('角色數量與玩家人數不符！(V3.0標準局需精準匹配)');
        return false;
    }
    
    // 洗牌與發牌
    let shuffledRoles = [...selectedRoles];
    for (let i = shuffledRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
    }
    
    playersData.forEach((player, index) => {
        player.role = shuffledRoles[index];
    });
    
    gameState.systemLog = '發牌完成，準備進入第一天夜晚...';
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    
    setTimeout(() => {
        startNightPhase();
    }, 5000);
    
    return true; // 允許前端隱藏設定面板
};

// ==========================================
// 狀態同步引擎 (核心機制)
// ==========================================
function syncStateToAll() {
    // 1. 同步給主機視圖
    const hostState = {
        phase: gameState.phase,
        systemLog: gameState.systemLog,
        players: playersData.map(p => ({ ...p })), // 主機看全視野
        nightFlow: buildNightFlowForHost(),
        allowForceNext: gameState.phase === GAME_PHASE.NIGHT_ACTION,
        dayBtnText: getDayBtnText(),
        dayBtnDisabled: getDayBtnDisabled(),
        dayBtnCommand: getDayBtnCommand()
    };
    UI.renderHostView(hostState, handleHostCommand);

    // 2. 分發客製化狀態給各個玩家
    playersData.forEach(player => {
        const playerState = buildStateForPlayer(player);
        if (connections[player.peerId]) {
            connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: playerState });
        }
    });
}

function buildStateForPlayer(player) {
    // 視野隔離運算
    const mappedPlayers = playersData.map(p => {
        let visibleRole = null;
        let wolfTags = [];
        
        // 永遠看見自己的身分
        if (p.seatNumber === player.seatNumber) visibleRole = p.role;
        // 狼人能看見其他狼人
        if (isWolfRole(player.role) && isWolfRole(p.role)) visibleRole = p.role;
        // 白痴翻牌後的公知視野 (預留擴充)
        if (p.role === '白痴' && p.idiotRevealed) visibleRole = p.role;

        // 若當前在狼人行動階段，且該玩家為狼人，則需顯示隊友預覽標籤
        if (gameState.phase === GAME_PHASE.NIGHT_ACTION && 
            gameState.nightSequence[gameState.currentNightStepIndex]?.roleName === "狼人" && 
            isWolfRole(player.role)) {
            
            // 尋找有沒有隊友指向這個座位
            Object.values(wolfPreviews).forEach(preview => {
                if (preview.target === p.seatNumber && preview.seat !== player.seatNumber) {
                    wolfTags.push(`${preview.seat}號`);
                }
            });
        }

        return { 
            seatNumber: p.seatNumber, 
            name: p.name, 
            isDead: p.isDead, 
            roleInfo: visibleRole,
            wolfTags: wolfTags
        };
    });

    // 判斷是否需要開啟行動面板
    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], allowPass: false, passTags: [] };
    let personalMessage = getPhaseMessageForPlayer();

    if (gameState.phase === GAME_PHASE.NIGHT_ACTION) {
        const currentStep = gameState.nightSequence[gameState.currentNightStepIndex];
        const isMyTurn = currentStep && currentStep.activePlayers.some(ap => ap.seatNumber === player.seatNumber);
        
        if (isMyTurn && !player.isDead) {
            actionPanel.show = true;
            actionPanel.type = currentStep.roleDef.actionType;
            actionPanel.prompt = currentStep.roleDef.prompt;
            actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
            actionPanel.allowPass = true; // 標準局夜間技能均允許跳過
            
            // 動態替換女巫的提示文字
            if (currentStep.roleName === "女巫-解藥") {
                if (gameState.witchState.antidoteUsed) {
                    actionPanel.prompt = "你的解藥已用過，無法得知刀口。(請跳過)";
                    actionPanel.selectableSeats = [];
                } else {
                    const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : "無";
                    actionPanel.prompt = actionPanel.prompt.replace('{victim}', victim);
                }
            } else if (currentStep.roleName === "女巫-毒藥") {
                if (gameState.witchState.poisonUsed) {
                    actionPanel.prompt = "你的毒藥已用過。(請跳過)";
                    actionPanel.selectableSeats = [];
                } else if (gameState.nightTags.witchUsedSaveTonight) {
                    actionPanel.prompt = "同一晚不可雙藥。(請跳過)";
                    actionPanel.selectableSeats = [];
                }
            }

            // 處理狼人空刀按鈕的標籤
            if (currentStep.roleName === "狼人" && isWolfRole(player.role)) {
                Object.values(wolfPreviews).forEach(preview => {
                    if (preview.target === 'pass' && preview.seat !== player.seatNumber) {
                        actionPanel.passTags.push(`${preview.seat}號`);
                    }
                });
            }
        }
    } else if (gameState.phase === GAME_PHASE.DAY_VOTING) {
        if (!player.isDead) {
            actionPanel.show = true;
            actionPanel.type = 'single_select'; // 投票視為單選
            actionPanel.prompt = '請選擇放逐投票的目標：';
            actionPanel.selectableSeats = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
            actionPanel.allowPass = true; // 視為棄票
        }
    }

    // 將之前暫存的查驗結果附加到 personalMessage
    if (player.tempPrivateMessage) {
        personalMessage += "\n" + player.tempPrivateMessage;
        player.tempPrivateMessage = null; // 讀取後清空
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

// 處理給玩家的階段提示文字
function getPhaseMessageForPlayer() {
    switch(gameState.phase) {
        case GAME_PHASE.NIGHT_TRANSITION: return "天黑請閉眼...";
        case GAME_PHASE.NIGHT_ACTION: return "夜間行動中，請等待...";
        case GAME_PHASE.DAWN_SETTLEMENT: return "天亮了，正在結算昨夜結果...";
        case GAME_PHASE.DAY_DISCUSSION: return "白天發言階段。";
        case GAME_PHASE.DAY_VOTING: return "正在進行放逐投票...";
        case GAME_PHASE.VOTE_SETTLEMENT: return "投票結算中...";
        default: return "等待中...";
    }
}

// ==========================================
// 夜間狀態機邏輯 (Night Phase Engine)
// ==========================================

function startNightPhase() {
    gameState.nightCount++;
    gameState.phase = GAME_PHASE.NIGHT_ACTION;
    gameState.systemLog = `進入第 ${gameState.nightCount} 夜。`;
    
    // 初始化今晚標籤
    gameState.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
    gameState.currentStepActions = [];
    wolfPreviews = {};

    // 建立今晚行動序列
    gameState.nightSequence = buildNightSequence();
    gameState.currentNightStepIndex = -1;
    
    nextNightStep();
}

function buildNightSequence() {
    let sequence = [];
    const alivePlayers = playersData.filter(p => !p.isDead);
    
    // 依據 ROLE_DICTIONARY 順序生成
    for (let order = 1; order <= 20; order++) {
        let activePlayers = [];
        let currentRoleDef = null;
        let currentRoleName = "";

        // 特殊處理狼人共識
        if (order === 11) {
            const aliveWolves = alivePlayers.filter(p => isWolfRole(p.role));
            if (aliveWolves.length > 0) {
                sequence.push({
                    order: 11,
                    roleName: "狼人",
                    activePlayers: aliveWolves,
                    roleDef: ROLE_DICTIONARY["狼人"],
                    resultLog: "等待行動..."
                });
            }
            continue;
        }

        // 一般神職處理
        for (const [rName, rDef] of Object.entries(ROLE_DICTIONARY)) {
            if (rDef.wakeOrder === order) {
                // 找出擁有該基礎角色的活著玩家
                const baseRole = rName.split('-')[0];
                const matchingPlayers = alivePlayers.filter(p => p.role === baseRole);
                
                if (matchingPlayers.length > 0) {
                    sequence.push({
                        order: order,
                        roleName: rName,
                        activePlayers: matchingPlayers,
                        roleDef: rDef,
                        resultLog: "等待行動..."
                    });
                }
            }
        }
    }
    return sequence;
}

function nextNightStep() {
    gameState.currentNightStepIndex++;
    
    if (gameState.currentNightStepIndex >= gameState.nightSequence.length) {
        // 所有夜間行動結束，進入結算
        gameState.phase = GAME_PHASE.DAWN_SETTLEMENT;
        gameState.systemLog = `夜間行動完畢，請按下天亮結算。`;
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
    syncStateToAll(); // 觸發實時渲染
}

function handleActionSubmit(peerId, payload) {
    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    if (!actingPlayer) return;

    gameState.currentStepActions.push({
        player: actingPlayer,
        targets: payload.targets || [],
        specialValue: payload.specialValue || null
    });

    gameState.expectedActionCount--;

    if (gameState.expectedActionCount <= 0) {
        resolveNightStep();
        setTimeout(nextNightStep, 1000); // 延遲一秒讓前端有視覺緩衝
    } else {
        syncStateToAll(); // 更新等待人數狀態
    }
}

function resolveNightStep() {
    const step = gameState.nightSequence[gameState.currentNightStepIndex];
    let resultText = "【未行動】";

    if (step.roleName === "狼人") {
        let voteCounts = {};
        gameState.currentStepActions.forEach(act => {
            const t = act.targets.length > 0 ? act.targets[0] : 'pass';
            voteCounts[t] = (voteCounts[t] || 0) + 1;
        });

        let maxVotes = 0;
        let finalTarget = 'pass';
        for (const [t, votes] of Object.entries(voteCounts)) {
            if (votes > maxVotes) { maxVotes = votes; finalTarget = t; }
        }

        if (finalTarget === 'pass') {
            resultText = "【空刀】";
        } else {
            resultText = `【襲擊: ${finalTarget}號】`;
            gameState.nightTags.killed.push(parseInt(finalTarget));
        }
    } 
    else {
        // 單點技能結算 (預、女)
        const act = gameState.currentStepActions[0];
        const target = act.targets.length > 0 ? act.targets[0] : null;

        switch (step.roleName) {
            case "女巫-解藥":
                if (target && !gameState.witchState.antidoteUsed) {
                    gameState.nightTags.killed = gameState.nightTags.killed.filter(id => id !== target);
                    gameState.nightTags.witchUsedSaveTonight = true;
                    gameState.witchState.antidoteUsed = true;
                    resultText = `【解救: ${target}號】`;
                } else resultText = "【跳過】";
                break;
            case "女巫-毒藥":
                if (target && !gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) {
                    gameState.nightTags.poisoned.push(target);
                    gameState.witchState.poisonUsed = true;
                    resultText = `【毒殺: ${target}號】`;
                } else resultText = "【跳過/無效】";
                break;
            case "預言家":
                if (target) {
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

    // 計算死亡 (標準局：狼刀 + 毒藥)
    playersData.forEach(p => {
        if (p.isDead) return;
        const seat = p.seatNumber;
        
        let isDying = gameState.nightTags.killed.includes(seat) || gameState.nightTags.poisoned.includes(seat);
        
        if (isDying) {
            p.isDead = true;
            deadThisNight.push(seat);
        }
    });

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(', ')} 號玩家死亡。` : `昨晚是平安夜。`;
    
    // (MVP 階段獵人開槍機制簡化為被動廣播，未包含中斷打槍介面)
    const deadHunters = deadThisNight.filter(s => playersData.find(p => p.seatNumber === s).role === '獵人');
    if (deadHunters.length > 0) {
        msg += `\n(獵人已死亡，依規則可開槍處理)`;
    }

    gameState.systemLog = msg;
    gameState.phase = GAME_PHASE.DAY_DISCUSSION;
    
    // 廣播給所有玩家看見死者
    playersData.forEach(p => {
        p.tempPrivateMessage = msg;
    });

    syncStateToAll();
}

// ==========================================
// 白天狀態機邏輯 (Day Phase Engine)
// ==========================================

function handleVoteSubmit(peerId, payload) {
    if (gameState.phase !== GAME_PHASE.DAY_VOTING) return;

    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead) return;

    const target = payload.targets && payload.targets.length > 0 ? payload.targets[0] : 'pass';
    gameState.votes[voter.seatNumber] = target;

    const aliveCount = playersData.filter(p => !p.isDead).length;
    const votedCount = Object.keys(gameState.votes).length;

    gameState.systemLog = `投票進度：${votedCount} / ${aliveCount}`;

    if (votedCount >= aliveCount) {
        resolveVoting();
    } else {
        syncStateToAll();
    }
}

function resolveVoting() {
    let voteCounts = {};
    Object.values(gameState.votes).forEach(t => {
        if (t !== 'pass') voteCounts[t] = (voteCounts[t] || 0) + 1;
    });

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;

    for (const [t, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    gameState.phase = GAME_PHASE.VOTE_SETTLEMENT;

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
            gameState.systemLog = `${finalTarget} 號被放逐出局。`;
            broadcastTempMessage(`${finalTarget} 號被放逐出局。`);
        }
    }

    syncStateToAll();
}

function broadcastTempMessage(msg) {
    playersData.forEach(p => p.tempPrivateMessage = msg);
}

// ==========================================
// 主持人 UI 控制介面繫結
// ==========================================
function buildNightFlowForHost() {
    return gameState.nightSequence.map((step, idx) => {
        let status = 'pending';
        if (idx < gameState.currentNightStepIndex) status = 'completed';
        if (idx === gameState.currentNightStepIndex) status = 'active';
        return {
            title: `${step.order}. ${step.roleName}`,
            status: status,
            result: step.resultLog
        };
    });
}

function getDayBtnText() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "發起放逐投票";
    if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) return "進入黑夜";
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return gameState.phase === GAME_PHASE.DAY_VOTING;
}

function getDayBtnCommand() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "START_VOTE";
    if (gameState.phase === GAME_PHASE.VOTE_SETTLEMENT) return "ENTER_NIGHT";
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
    } else if (cmd === 'ENTER_NIGHT') {
        gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
        syncStateToAll();
        setTimeout(startNightPhase, 3000);
    }
}
function broadcastToAll(data) { playersData.forEach(p => { if (connections[p.peerId]) connections[p.peerId].send(data); }); }
function sendToPlayer(peerId, data) { if (connections[peerId]) connections[peerId].send(data); }