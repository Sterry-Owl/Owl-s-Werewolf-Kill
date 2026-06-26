// ==========================================
// v3.6.9 核心主機引擎 (Smart Server / Strategy Pattern)
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
    witchState: { antidoteUsed: false, poisonUsed: false, savedSeat: null }, // [新增] savedSeat 用於記錄銀水
    votes: {},
    voteHistory: [],             // [新增] 歷史投票紀錄陣列
    currentVoteResultString: "", // [新增] 當下投票詳細結果字串
    lastWordsTargets: [],        // [新增] 準備發表遺言的玩家陣列
    nextPhaseAfterLastWords: null, // [新增] 遺言結束後的跳轉目標
    pendingHunter: false,        // [新增] 投票階段的獵人開槍緩衝
    
    hunterOriginPhase: null, 
    systemLog: "等待遊戲開始..."
};

let wolfPreviews = {};

function isWolfRole(roleStr) {
    if (!roleStr) return false;
    return roleStr.startsWith('狼人');
}

// ==========================================
// 角色外掛註冊表 (Role Plugins)
// ==========================================
const RolePlugins = {
    "狼人": {
        canSelfExplode: true, // [新增] 模組化自爆權限屬性
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
                    // [新增] 紀錄銀水目標，供日後UI呼叫
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
            case PACKET_TYPE.WOLF_EXPLODE: handleWolfExplode(conn.peer); break; // [新增] 自爆封包監聽
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    if (gameState.phase !== GAME_PHASE.LOBBY) return; 
    const seatNumber = playersData.length + 1;
    playersData.push({ seatNumber, peerId, name: playerName, role: null, isDead: false, seerRecords: {}, latestCheckResult: null });
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
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS].includes(gameState.phase);

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
        let visibleRole = null;
        let wolfTags = [];
        let tags = []; // [新增] 通用標籤陣列
        let knownAlignment = null;
        
        if (p.seatNumber === player.seatNumber) visibleRole = p.role;
        if (isWolfRole(player.role) && isWolfRole(p.role)) visibleRole = p.role;
        if (p.role === '白痴' && p.idiotRevealed) visibleRole = p.role;

        if (player.role === '預言家' && player.seerRecords && player.seerRecords[p.seatNumber]) {
            knownAlignment = player.seerRecords[p.seatNumber];
        }

        // [新增] 寫入銀水標籤 (僅該名女巫可見)
        if (player.role === '女巫' && gameState.witchState.savedSeat === p.seatNumber) {
            tags.push('銀水');
        }

        if (gameState.phase === GAME_PHASE.NIGHT_ACTION && gameState.nightSequence[gameState.currentNightStepIndex]?.roleName === "狼人" && isWolfRole(player.role)) {
            Object.values(wolfPreviews).forEach(preview => {
                if (preview.target === p.seatNumber && preview.seat !== player.seatNumber) wolfTags.push(`${preview.seat}號`);
            });
        }
        return { seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, roleInfo: visibleRole, wolfTags: wolfTags, tags: tags, knownAlignment: knownAlignment };
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
            actionPanel.passTags = plugin ? plugin.getPassTags(player.seatNumber) : [];
            actionPanel.preSelectedTarget = plugin && plugin.getPreSelectedTarget ? plugin.getPreSelectedTarget() : null; 
            actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;

            if (hasActed) {
                // [新增] 狼人完全行動完畢的3秒緩衝內，展示最終刀口
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
    // [新增] 投票明細展示階段
    else if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) {
        actionPanel.show = true;
        actionPanel.prompt = gameState.currentVoteResultString;
        actionPanel.buttons = [];
    }
    // [新增] 遺言階段展示
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
        voteHistory: gameState.voteHistory, // [新增] 下發歷史紀錄
        allowSelfExplode: !player.isDead && isDayPhase && RolePlugins[player.role]?.canSelfExplode // [新增] 自爆權限判定
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
        default: return "等待中...";
    }
}

// [新增] 狼人自爆執行函式 (打斷狀態機並跳夜)
function handleWolfExplode(peerId) {
    const player = playersData.find(p => p.peerId === peerId);
    if (!player || player.isDead) return;
    
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS].includes(gameState.phase);
    if (!isDayPhase || !RolePlugins[player.role]?.canSelfExplode) return;

    player.isDead = true;
    gameState.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇自爆！`;
    broadcastTempMessage(`【突發事件】${player.seatNumber} 號玩家選擇自爆\n發言階段立即結束！`);
    
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
        } else {
            gameState.systemLog = `獵人選擇不開槍/無技能。`;
        }
        
        gameState.phase = gameState.hunterOriginPhase;
        syncStateToAll();

        // 獵人發動完畢後，回到原本的排程跳轉
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
        
        setTimeout(nextNightStep, 3000); // 延長緩衝讓狼人看刀口
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

    gameState.lastWordsTargets = [];
    // [新增] 判斷首夜死者，賦予遺言權利
    if (gameState.nightCount === 1 && deadThisNight.length > 0) {
        gameState.lastWordsTargets = [...deadThisNight];
    }

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(' 號、')} 號玩家死亡。` : `昨晚是平安夜。`;
    gameState.systemLog = msg;
    broadcastTempMessage(msg);

    if (hunterDied) {
        gameState.phase = GAME_PHASE.HUNTER_ACTION;
        // 決定獵人開完槍後要去哪
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
        // [新增] 彙整詳細投票名單
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

    // --- 建立格式化的投票明細 ---
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
            idiotSaved = true;
            header = `投票結果出爐，${finalTarget} 號最高票\n觸發【白痴】免除出局`;
        } else {
            tPlayer.isDead = true;
            if (tPlayer.role === '獵人') gameState.pendingHunter = true;
            gameState.lastWordsTargets = [finalTarget]; // 放逐出局獲得遺言
        }
    }

    gameState.currentVoteResultString = `${header}\n${resultLines.join('\n')}`;
    gameState.voteHistory.push(`【第 ${gameState.nightCount} 天】\n${gameState.currentVoteResultString}`);
    
    gameState.systemLog = header.replace('\n', '');
    gameState.phase = GAME_PHASE.VOTE_RESULT_DISPLAY; // 進入明細展示階段
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
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return [GAME_PHASE.DAY_VOTING, GAME_PHASE.HUNTER_ACTION, GAME_PHASE.VOTE_SETTLEMENT].includes(gameState.phase);
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
        // 展示完投票明細後，依序判斷：獵人開槍 -> 發表遺言 -> 黑夜
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