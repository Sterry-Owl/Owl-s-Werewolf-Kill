// ==========================================
// v3.6.11 核心主機引擎 (Smart Server / Strategy Pattern)
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
    witchState: { antidoteUsed: false, poisonUsed: false, savedSeat: null }, 
    votes: {},
    voteHistory: [],             
    currentVoteResultString: "", 
    lastWordsTargets: [],        
    nextPhaseAfterLastWords: null, 
    pendingHunter: false,        
    
    hunterOriginPhase: null, 
    systemLog: "等待遊戲開始..."
};

let wolfPreviews = {};

function isWolfRole(roleStr) {
    if (!roleStr) return false;
    // 透過字典檔陣營判斷，取代字串比對
    return ROLE_DICTIONARY[roleStr]?.faction === 'wolf';
}

// ==========================================
// 角色外掛註冊表 (Role Plugins)
// ==========================================
const RolePlugins = {
    "狼人": {
        canSelfExplode: true,
        getPrompt: () => ROLE_DICTIONARY["狼人"].prompt,
        getSelectableSeats: () => playersData.filter(p => !p.isDead).map(p => p.seatNumber),
        getButtons: () => [
            { id: 'confirm', text: '確認襲擊', requiresTarget: true },
            { id: 'pass', text: '空刀', requiresTarget: false }
        ],
        // 原本用於 Pass 的標籤邏輯，因為視圖重構，這裡改傳純座號陣列供後續擴充
        getPassTags: (mySeat) => { return []; }, 
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
        canSelfExplode: false,
        getPrompt: () => {
            if (gameState.witchState.antidoteUsed) return "你的解藥已用過，無法得知刀口。請選擇要發動的技能：";
            const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : "無";
            return `昨晚被襲擊的是 ${victim} 號。請選擇要發動的技能：`;
        },
        getSelectableSeats: () => {
            if (gameState.witchState.antidoteUsed && gameState.witchState.poisonUsed) return [];
            return playersData.filter(p => !p.isDead).map(p => p.seatNumber);
        },
        getButtons: () => {
            let btns = [];
            if (!gameState.witchState.antidoteUsed) btns.push({ id: 'save', text: '使用解藥', requiresTarget: false });
            if (!gameState.witchState.poisonUsed && !gameState.nightTags.witchUsedSaveTonight) {
                btns.push({ id: 'poison', text: '使用毒藥', requiresTarget: true });
            }
            btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
            return btns;
        },
        getPreSelectedTarget: () => {
            return (!gameState.witchState.antidoteUsed && gameState.nightTags.killed.length > 0) ? gameState.nightTags.killed[0] : null;
        },
        getPassTags: () => [],
        resolve: (actions) => {
            const act = actions[0];
            const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
            if (act.actionId === 'save' && !gameState.witchState.antidoteUsed) {
                if (gameState.nightTags.killed.length > 0) {
                    gameState.witchState.savedSeat = gameState.nightTags.killed[0];
                    gameState.nightTags.killed = []; 
                    gameState.nightTags.witchUsedSaveTonight = true;
                    gameState.witchState.antidoteUsed = true;
                    return "【解救成功】";
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
            return "【跳過行動】";
        }
    },
    "預言家": {
        canSelfExplode: false,
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
                const alignment = isWolf ? "狼人" : "好人";
                
                act.player.seerRecords = act.player.seerRecords || {};
                act.player.seerRecords[target] = alignment;
                act.player.latestCheckResult = { seat: target, alignment: alignment };
                
                act.player.tempPrivateMessage = `系統提示：${target}號玩家為【${alignment}】陣營。`;
                return `【查驗: ${target}號】`;
            }
            return "【跳過行動】";
        }
    }
};

// ==========================================
// 全域狀態分發與生命週期控制
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
            case PACKET_TYPE.WOLF_EXPLODE: handleWolfExplode(conn.peer); break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    if (gameState.phase !== GAME_PHASE.LOBBY) return; 
    const seatNumber = playersData.length + 1;
    playersData.push({ 
        seatNumber, peerId, name: playerName, role: null, 
        isDead: false, isRevealed: false, // [新增] 明牌標記 (自爆/翻牌用)
        seerRecords: {}, latestCheckResult: null 
    });
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

// [新增] 核心勝負仲裁引擎 (屠邊邏輯 + 狼人優先)
function checkAndTriggerWin() {
    if (gameState.phase === GAME_PHASE.GAME_OVER) return true;

    const alivePlayers = playersData.filter(p => !p.isDead);
    const wolfCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf').length;
    const godCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.type === 'god').length;
    const villagerCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.type === 'villager').length;

    let winner = null;
    let reason = "";

    // 狼人條件優先：神職死光 或 平民死光
    if (godCount === 0 || villagerCount === 0) {
        winner = "狼人";
        reason = godCount === 0 ? "神職全數出局" : "平民全數出局";
    } 
    // 好人條件：狼人死光
    else if (wolfCount === 0) {
        winner = "好人";
        reason = "狼人全數出局";
    }

    if (winner) {
        gameState.phase = GAME_PHASE.GAME_OVER;
        gameState.systemLog = `遊戲結束，${winner}陣營勝利！\n(${reason})`;
        broadcastTempMessage(`遊戲結束，${winner}陣營勝利！\n(${reason})`);
        syncStateToAll();
        return true;
    }
    return false;
}

function syncStateToAll() {
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS, GAME_PHASE.GAME_OVER].includes(gameState.phase);

    const hostState = {
        systemLog: gameState.systemLog,
        players: playersData.map(p => ({ ...p })),
        layout: {
            showSetupPanel: gameState.phase === GAME_PHASE.LOBBY,
            showNightPanel: [GAME_PHASE.NIGHT_TRANSITION, GAME_PHASE.NIGHT_ACTION, GAME_PHASE.DAWN_SETTLEMENT].includes(gameState.phase),
            showDayPanel: isDayPhase
        },
        nightFlow: buildNightFlowForHost(),
        allowForceNext: gameState.phase === GAME_PHASE.NIGHT_ACTION,
        dayBtnText: getDayBtnText(),
        dayBtnDisabled: getDayBtnDisabled(),
        dayBtnCommand: getDayBtnCommand()
    };
    UI.renderHostView(hostState, handleHostCommand);

    playersData.forEach(player => {
        const playerState = buildStateForPlayer(player, isDayPhase);
        if (connections[player.peerId]) connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: playerState });
    });
}

function buildStateForPlayer(player, isDayPhase) {
    const mappedPlayers = playersData.map(p => {
        let topTag = null;
        let rightTag = null;
        
        // 1. 頂部標籤指派邏輯 (上帝視角/明牌/自己/狼人隊友)
        if (gameState.phase === GAME_PHASE.GAME_OVER) {
            topTag = p.role;
        } else if (p.seatNumber === player.seatNumber) {
            topTag = p.role;
        } else if (p.isRevealed) {
            topTag = p.role;
        } else if (ROLE_DICTIONARY[player.role]?.faction === 'wolf' && ROLE_DICTIONARY[p.role]?.faction === 'wolf') {
            topTag = "狼人"; 
        }

        // 2. 右側標籤指派邏輯 (技能資訊)
        if (player.role === '預言家' && player.seerRecords && player.seerRecords[p.seatNumber]) {
            rightTag = player.seerRecords[p.seatNumber];
        } else if (player.role === '女巫' && gameState.witchState.savedSeat === p.seatNumber) {
            rightTag = "銀水";
        }

        return { 
            seatNumber: p.seatNumber, 
            name: p.name, 
            isDead: p.isDead, 
            topTag: topTag,     // [改動] 資料驅動
            rightTag: rightTag  // [改動] 資料驅動
        };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer();

    if (gameState.phase === GAME_PHASE.NIGHT_ACTION) {
        const currentStep = gameState.nightSequence[gameState.currentNightStepIndex];
        const isMyTurn = currentStep && currentStep.activePlayers.some(ap => ap.seatNumber === player.seatNumber);
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (isMyTurn && !player.isDead) {
            actionPanel.show = true;
            const plugin = RolePlugins[currentStep.roleName];
            actionPanel.type = currentStep.roleDef.actionType;
            actionPanel.prompt = plugin ? plugin.getPrompt() : "請行動：";
            actionPanel.selectableSeats = plugin ? plugin.getSelectableSeats() : [];
            actionPanel.buttons = plugin ? plugin.getButtons() : [];
            actionPanel.preSelectedTarget = plugin && plugin.getPreSelectedTarget ? plugin.getPreSelectedTarget() : null; 
            actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;

            if (hasActed) {
                if (currentStep.roleName === "狼人" && gameState.expectedActionCount <= 0) {
                    actionPanel.prompt = `今晚最終決定：\n${currentStep.resultLog}`;
                } else {
                    actionPanel.prompt = (currentStep.roleName === "狼人") ? "等待隊友決定目標..." : "行動已送出，等待系統結算...";
                }
                actionPanel.buttons = []; 
            }
        }
    } 
    else if (gameState.phase === GAME_PHASE.DAY_VOTING) {
        const hasVoted = gameState.votes[player.seatNumber] !== undefined;
        if (!player.isDead) {
            actionPanel.show = true;
            if (hasVoted) {
                actionPanel.prompt = "你已經投票完成，等待其他玩家投票...";
                actionPanel.buttons = []; 
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
    else if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) {
        actionPanel.show = true;
        actionPanel.prompt = gameState.currentVoteResultString;
        actionPanel.buttons = [];
    }
    else if (gameState.phase === GAME_PHASE.LAST_WORDS) {
        actionPanel.show = true;
        let targets = [...gameState.lastWordsTargets].sort((a,b) => a - b);
        if (targets.length === 1) {
            actionPanel.prompt = `請 ${targets[0]} 號玩家發表遺言`;
        } else if (targets.length > 1) {
            actionPanel.prompt = `請 ${targets.join('號、')} 號玩家發表遺言\n由 ${targets[0]} 號開始發表(號碼小的先)`;
        } else {
            actionPanel.prompt = "遺言階段";
        }
        actionPanel.buttons = [];
    }
    else if (gameState.phase === GAME_PHASE.HUNTER_ACTION) {
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        if (player.role === '獵人') {
            actionPanel.show = true;
            if (hasActed) {
                actionPanel.prompt = "開槍決定已送出，等待系統結算...";
                actionPanel.buttons = [];
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
        } else {
            actionPanel.show = true;
            actionPanel.prompt = "系統結算中，請等待...";
            actionPanel.buttons = [];
        }
    }
    else if (gameState.phase === GAME_PHASE.GAME_OVER) {
        actionPanel.show = true;
        actionPanel.prompt = gameState.systemLog;
        actionPanel.buttons = [];
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
        actionPanel: actionPanel,
        latestCheckResult: player.latestCheckResult || null,
        voteHistory: gameState.voteHistory,
        allowSelfExplode: !player.isDead && isDayPhase && RolePlugins[player.role]?.canSelfExplode 
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
        case GAME_PHASE.VOTE_RESULT_DISPLAY: return "展示投票結果...";
        case GAME_PHASE.LAST_WORDS: return "遺言發表階段。";
        case GAME_PHASE.HUNTER_ACTION: return "系統結算中，請等待..."; 
        case GAME_PHASE.GAME_OVER: return "遊戲結束。";
        default: return "等待中...";
    }
}

function handleWolfExplode(peerId) {
    const player = playersData.find(p => p.peerId === peerId);
    if (!player || player.isDead) return;
    
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS].includes(gameState.phase);
    if (!isDayPhase || !RolePlugins[player.role]?.canSelfExplode) return;

    player.isDead = true;
    player.isRevealed = true; // [改動] 自爆者翻牌標記
    
    gameState.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇自爆！`;
    broadcastTempMessage(`【突發事件】${player.seatNumber} 號玩家選擇自爆\n發言階段立即結束！`);
    
    // [仲裁] 檢查是否達標
    if (checkAndTriggerWin()) return;

    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(startNightPhase, 4000);
}

function startNightPhase() {
    gameState.nightCount++;
    gameState.phase = GAME_PHASE.NIGHT_ACTION;
    gameState.systemLog = `進入第 ${gameState.nightCount} 夜。`;
    gameState.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
    gameState.currentStepActions = [];
    wolfPreviews = {};
    
    playersData.forEach(p => p.latestCheckResult = null);
    
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
            broadcastTempMessage(`【突發事件】一聲槍響，${target} 號玩家被帶走。`);
            
            // [仲裁] 獵人開槍可能屠城/屠邊
            if (checkAndTriggerWin()) return;
        } else {
            gameState.systemLog = `獵人選擇不開槍/無技能。`;
        }
        
        gameState.phase = gameState.hunterOriginPhase;
        syncStateToAll();

        if (gameState.phase === GAME_PHASE.NIGHT_TRANSITION) setTimeout(startNightPhase, 4000);
        return;
    }

    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    gameState.currentStepActions.push({ player: actingPlayer, targets: payload.targets || [], actionId: payload.actionId });
    gameState.expectedActionCount--;

    if (gameState.expectedActionCount <= 0) {
        const step = gameState.nightSequence[gameState.currentNightStepIndex];
        const plugin = RolePlugins[step.roleName];
        
        if (plugin) step.resultLog = plugin.resolve(gameState.currentStepActions);
        else step.resultLog = "【未定義結算模組】";
        
        gameState.systemLog = `【${step.roleName}】行動完畢，即將切換...`;
        syncStateToAll();
        
        setTimeout(nextNightStep, 3000); 
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
            if (p.role === '獵人') {
                hunterDied = true;
                p.isRevealed = true; // [改動] 獵人死因公布身分 (準備開槍)
            }
        }
    });
    
    // [仲裁] 晚上死人，可能屠邊
    if (checkAndTriggerWin()) return;

    gameState.lastWordsTargets = [];
    if (gameState.nightCount === 1 && deadThisNight.length > 0) {
        gameState.lastWordsTargets = [...deadThisNight];
    }

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(' 號、')} 號玩家死亡。` : `昨晚是平安夜。`;
    gameState.systemLog = msg;
    broadcastTempMessage(msg);

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        gameState.hunterOriginPhase = (gameState.lastWordsTargets.length > 0) ? GAME_PHASE.LAST_WORDS : GAME_PHASE.DAY_DISCUSSION;
        gameState.nextPhaseAfterLastWords = GAME_PHASE.DAY_DISCUSSION;
    } else if (gameState.lastWordsTargets.length > 0) {
        gameState.phase = GAME_PHASE.LAST_WORDS;
        gameState.nextPhaseAfterLastWords = GAME_PHASE.DAY_DISCUSSION;
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
    let voteGroups = {}; 
    Object.entries(gameState.votes).forEach(([voter, t]) => {
        if (t !== 'pass') voteCounts[t] = (voteCounts[t] || 0) + 1;
        if (!voteGroups[t]) voteGroups[t] = [];
        voteGroups[t].push(voter);
    });

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;

    for (const [t, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    let resultLines = [];
    for (const [target, voters] of Object.entries(voteGroups)) {
        const targetName = target === 'pass' ? '棄票' : `${target}號`;
        const voterNames = voters.map(v => `${v}號`).join('、');
        resultLines.push(`。${voterNames} → ${targetName}`);
    }

    let header = isTie ? "投票結果出爐，平票或全數棄票，無人出局" : `投票結果出爐，${finalTarget} 號玩家出局`;
    let idiotSaved = false;
    
    gameState.pendingHunter = false;
    gameState.lastWordsTargets = [];

    if (!isTie && finalTarget) {
        const tPlayer = playersData.find(p => p.seatNumber === finalTarget);
        if (tPlayer.role === '白痴' && !tPlayer.idiotRevealed) {
            tPlayer.idiotRevealed = true;
            tPlayer.isRevealed = true; // [改動] 白痴翻牌
            idiotSaved = true;
            header = `投票結果出爐，${finalTarget} 號最高票\n觸發【白痴】免除出局`;
        } else {
            tPlayer.isDead = true;
            if (tPlayer.role === '獵人') {
                gameState.pendingHunter = true;
                tPlayer.isRevealed = true; // [改動] 獵人開槍翻牌
            }
            gameState.lastWordsTargets = [finalTarget]; 
        }
    }
    
    // [仲裁] 放逐死人，可能屠邊
    if (!idiotSaved && checkAndTriggerWin()) return;

    gameState.currentVoteResultString = `${header}\n${resultLines.join('\n')}`;
    gameState.voteHistory.push(`【第 ${gameState.nightCount} 天】\n${gameState.currentVoteResultString}`);
    
    gameState.systemLog = header.replace('\n', '');
    gameState.phase = GAME_PHASE.VOTE_RESULT_DISPLAY; 
    syncStateToAll();
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
    if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) return "結束展示，進入下一步";
    if (gameState.phase === GAME_PHASE.LAST_WORDS) return "結束遺言，進入下一階段";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "進入白天並發布死訊";
    if (gameState.phase === GAME_PHASE.HUNTER_ACTION) return "等待獵人開槍...";
    if (gameState.phase === GAME_PHASE.GAME_OVER) return "遊戲已結束"; // [新增]
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return [GAME_PHASE.DAY_VOTING, GAME_PHASE.HUNTER_ACTION, GAME_PHASE.VOTE_SETTLEMENT, GAME_PHASE.GAME_OVER].includes(gameState.phase);
}

function getDayBtnCommand() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "START_VOTE";
    if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) return "END_VOTE_DISPLAY";
    if (gameState.phase === GAME_PHASE.LAST_WORDS) return "END_LAST_WORDS";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "PROCESS_DAWN"; 
    return "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT') {
        const step = gameState.nightSequence[gameState.currentNightStepIndex];
        const plugin = RolePlugins[step.roleName];
        step.resultLog = plugin ? plugin.resolve(gameState.currentStepActions) : "【強制跳過】";
        gameState.systemLog = `【強制跳過】，即將切換...`;
        syncStateToAll();
        setTimeout(nextNightStep, 1000);
    } 
    else if (cmd === 'START_VOTE') {
        gameState.phase = GAME_PHASE.DAY_VOTING;
        gameState.votes = {};
        gameState.systemLog = "正在進行放逐投票...";
        syncStateToAll();
    } 
    else if (cmd === 'END_VOTE_DISPLAY') {
        if (gameState.pendingHunter) {
            gameState.pendingHunter = false;
            gameState.phase = GAME_PHASE.HUNTER_ACTION;
            gameState.hunterOriginPhase = gameState.lastWordsTargets.length > 0 ? GAME_PHASE.LAST_WORDS : GAME_PHASE.NIGHT_TRANSITION;
            gameState.nextPhaseAfterLastWords = GAME_PHASE.NIGHT_TRANSITION;
        } else if (gameState.lastWordsTargets.length > 0) {
            gameState.phase = GAME_PHASE.LAST_WORDS;
            gameState.nextPhaseAfterLastWords = GAME_PHASE.NIGHT_TRANSITION;
        } else {
            gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
            setTimeout(startNightPhase, 3000);
        }
        syncStateToAll();
    }
    else if (cmd === 'END_LAST_WORDS') {
        gameState.phase = gameState.nextPhaseAfterLastWords || GAME_PHASE.DAY_DISCUSSION;
        syncStateToAll();
        if (gameState.phase === GAME_PHASE.NIGHT_TRANSITION) setTimeout(startNightPhase, 3000);
    }
    else if (cmd === 'PROCESS_DAWN') {
        processDawn();
    }
}

function broadcastToAll(data) { playersData.forEach(p => { if (connections[p.peerId]) connections[p.peerId].send(data); }); }