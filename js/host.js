// ==========================================
// v3.7.0 核心主機引擎 (Smart Server / Strategy Pattern)
// ==========================================

let hostPeer = null;
let connections = {};
let playersData = []; 
let currentRoomId = null;

let gameState = {
    phase: GAME_PHASE.LOBBY,
    boardName: "",
    rules: {},               // [新增] 存放遊戲規則
    nightCount: 0,
    nightSequence: [],       
    currentNightStepIndex: -1, 
    expectedActionCount: 0,  
    currentStepActions: [],  
    nightTimeout: null,      // [新增] 伺服器計時器
    nightDeadline: null,     // [新增] 傳給前端的死線時間戳
    
    nightTags: { killed: [], poisoned: [], witchUsedSaveTonight: false },
    witchState: { antidoteUsed: false, poisonUsed: false, savedSeat: null }, 
    votes: {},
    voteHistory: [],             
    currentVoteResultString: "", 
    lastWordsTargets: [],        
    nextPhaseAfterLastWords: null, 
    nextPhaseAfterVoteDisplay: null, // [新增] 控制投票結果後的流向 (PK 用)
    
    isPK: false,             // [新增] PK 狀態旗標
    pkTargets: [],           // [新增] 參與 PK 的玩家座號

    pendingHunter: false,        
    hunterOriginPhase: null, 
    systemLog: "等待遊戲開始..."
};

let wolfPreviews = {};

function isWolfRole(roleStr) {
    if (!roleStr) return false;
    return ROLE_DICTIONARY[roleStr]?.faction === 'wolf';
}

const RolePlugins = {
    "狼人": {
        canSelfExplode: true,
        getPrompt: () => ROLE_DICTIONARY["狼人"].prompt,
        getSelectableSeats: () => playersData.filter(p => !p.isDead).map(p => p.seatNumber),
        getButtons: () => [
            { id: 'confirm', text: '確認襲擊', requiresTarget: true },
            { id: 'pass', text: '空刀', requiresTarget: false }
        ],
        getPassTags: (mySeat) => {
            let tags = [];
            Object.values(wolfPreviews).forEach(preview => {
                if (String(preview.target) === 'pass' && preview.seat !== mySeat) tags.push(`${preview.seat}號`);
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
        getPrompt: (mySeat) => {
            if (gameState.witchState.antidoteUsed) return "你的解藥已用過，無法得知刀口。請選擇要發動的技能：";
            const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : "無";
            
            let extraMsg = "";
            if (victim === mySeat) {
                const rule = gameState.rules.witchSave;
                if (rule === 'never') extraMsg = "\n(規則：女巫全程不可自救)";
                if (rule === 'first_night' && gameState.nightCount > 1) extraMsg = "\n(規則：女巫僅首夜可自救)";
            }
            return `昨晚被襲擊的是 ${victim} 號。${extraMsg}\n請選擇要發動的技能：`;
        },
        getSelectableSeats: () => {
            if (gameState.witchState.antidoteUsed && gameState.witchState.poisonUsed) return [];
            return playersData.filter(p => !p.isDead).map(p => p.seatNumber);
        },
        getButtons: (mySeat) => {
            let btns = [];
            const victim = gameState.nightTags.killed.length > 0 ? gameState.nightTags.killed[0] : null;
            
            // [核心新增] 智慧判斷女巫自救規則
            let canSave = !gameState.witchState.antidoteUsed;
            if (canSave && victim === mySeat) {
                const rule = gameState.rules.witchSave;
                if (rule === 'never') canSave = false;
                if (rule === 'first_night' && gameState.nightCount > 1) canSave = false;
            }

            if (canSave) btns.push({ id: 'save', text: '使用解藥', requiresTarget: false });
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
            if (!act) return "【跳過行動】"; // Timeout default
            
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
            if (!act) return "【跳過行動】";

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
        isDead: false, isRevealed: false, 
        seerRecords: {}, latestCheckResult: null 
    });
    if (connections[peerId]) connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber } });
    gameState.systemLog = `玩家 ${playerName} (${seatNumber}號) 已加入。`;
    syncStateToAll();
}

window.startGame = function(selectedRoles, boardName, rules) {
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
    
    gameState.boardName = boardName;
    gameState.rules = rules;
    gameState.systemLog = '發牌完成，準備進入第一天夜晚...';
    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(() => { startNightPhase(); }, 5000);
    return true; 
};

function checkAndTriggerWin() {
    if (gameState.phase === GAME_PHASE.GAME_OVER) return true;

    const alivePlayers = playersData.filter(p => !p.isDead);
    const wolfCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf').length;
    const godCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.type === 'god').length;
    const villagerCount = alivePlayers.filter(p => ROLE_DICTIONARY[p.role]?.type === 'villager').length;

    let winner = null;
    let reason = "";

    // [核心修改] 根據設定判斷屠城或屠邊
    if (gameState.rules.winCondition === 'kill_all') {
        if (godCount + villagerCount === 0) {
            winner = "狼人";
            reason = "好人陣營全數出局 (屠城)";
        }
    } else {
        if (godCount === 0 || villagerCount === 0) {
            winner = "狼人";
            reason = godCount === 0 ? "神職全數出局 (屠邊)" : "平民全數出局 (屠邊)";
        } 
    }
    
    if (!winner && wolfCount === 0) {
        winner = "好人";
        reason = "狼人全數出局";
    }

    if (winner) {
        gameState.phase = GAME_PHASE.GAME_OVER;
        if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
        gameState.systemLog = `遊戲結束，${winner}陣營勝利！\n(${reason})`;
        broadcastTempMessage(`遊戲結束，${winner}陣營勝利！\n(${reason})`);
        syncStateToAll();
        return true;
    }
    return false;
}

function syncStateToAll() {
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.PK_SPEECH, GAME_PHASE.PK_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS, GAME_PHASE.GAME_OVER].includes(gameState.phase);

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
        let sideTag = null;
        let wolfPreviewTags = [];
        let isWolfSelected = false;
        
        if (gameState.phase === GAME_PHASE.GAME_OVER) {
            topTag = p.role;
        } else if (p.seatNumber === player.seatNumber) {
            topTag = p.role;
        } else if (p.isRevealed) {
            topTag = p.role;
        } else if (ROLE_DICTIONARY[player.role]?.faction === 'wolf' && ROLE_DICTIONARY[p.role]?.faction === 'wolf') {
            topTag = "狼人"; 
        }

        if (player.role === '預言家' && player.seerRecords && player.seerRecords[p.seatNumber]) {
            sideTag = player.seerRecords[p.seatNumber]; 
        } else if (player.role === '女巫' && gameState.witchState.savedSeat === p.seatNumber) {
            sideTag = "銀水"; 
        }

        if (gameState.phase === GAME_PHASE.NIGHT_ACTION && gameState.nightSequence[gameState.currentNightStepIndex]?.phaseName === "午夜 (狼人)" && isWolfRole(player.role)) {
            Object.values(wolfPreviews).forEach(preview => {
                if (String(preview.target) === String(p.seatNumber) && preview.seat !== player.seatNumber) {
                    wolfPreviewTags.push(`${preview.seat}號`);
                    isWolfSelected = true;
                }
            });
        }

        return { 
            seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, 
            topTag: topTag, sideTag: sideTag, wolfPreviewTags: wolfPreviewTags, isWolfSelected: isWolfSelected    
        };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer();

    if (gameState.phase === GAME_PHASE.NIGHT_ACTION) {
        const currentPhase = gameState.nightSequence[gameState.currentNightStepIndex];
        let myRoleInPhase = currentPhase ? currentPhase.roles.find(r => r.activePlayers.some(ap => ap.seatNumber === player.seatNumber)) : null;
        const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (myRoleInPhase && !player.isDead) {
            actionPanel.show = true;
            actionPanel.deadline = gameState.nightDeadline; // 傳送倒數死線
            
            const plugin = RolePlugins[myRoleInPhase.roleName];
            actionPanel.type = myRoleInPhase.roleDef.actionType;
            actionPanel.prompt = plugin ? plugin.getPrompt(player.seatNumber) : "請行動：";
            actionPanel.selectableSeats = plugin ? plugin.getSelectableSeats() : [];
            actionPanel.buttons = plugin ? plugin.getButtons(player.seatNumber) : [];
            actionPanel.preSelectedTarget = plugin && plugin.getPreSelectedTarget ? plugin.getPreSelectedTarget() : null; 
            actionPanel.passTags = plugin && plugin.getPassTags ? plugin.getPassTags(player.seatNumber) : [];
            actionPanel.submitPacketType = PACKET_TYPE.ACTION_SUBMIT;

            if (hasActed) {
                if (myRoleInPhase.roleName === "狼人" && gameState.expectedActionCount <= 0) {
                    actionPanel.prompt = `今晚最終決定：\n${myRoleInPhase.resultLog}`;
                } else {
                    actionPanel.prompt = (myRoleInPhase.roleName === "狼人") ? "等待隊友決定目標..." : "行動已送出，等待系統結算...";
                }
                actionPanel.buttons = []; 
                actionPanel.deadline = null; // 隱藏計時器
            }
        }
    } 
    else if (gameState.phase === GAME_PHASE.DAY_VOTING || gameState.phase === GAME_PHASE.PK_VOTING) {
        const hasVoted = gameState.votes[player.seatNumber] !== undefined;
        const isPK = gameState.phase === GAME_PHASE.PK_VOTING;
        // [新增] PK 階段，參與 PK 的目標不可投票
        const canVote = isPK ? !gameState.pkTargets.includes(player.seatNumber) : true;

        if (!player.isDead) {
            actionPanel.show = true;
            if (!canVote) {
                actionPanel.prompt = "你是 PK 發言對象，無法參與本次投票。";
                actionPanel.buttons = [];
            } else if (hasVoted) {
                actionPanel.prompt = "你已經投票完成，等待其他玩家投票...";
                actionPanel.buttons = []; 
            } else {
                actionPanel.type = 'single_select'; 
                actionPanel.prompt = isPK ? '請選擇 PK 放逐投票的目標：' : '請選擇放逐投票的目標：';
                actionPanel.selectableSeats = isPK ? gameState.pkTargets : playersData.filter(p => !p.isDead).map(p => p.seatNumber);
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
    else if (gameState.phase === GAME_PHASE.LAST_WORDS || gameState.phase === GAME_PHASE.PK_SPEECH) {
        actionPanel.show = true;
        let targets = gameState.phase === GAME_PHASE.PK_SPEECH ? [...gameState.pkTargets] : [...gameState.lastWordsTargets].sort((a,b) => a - b);
        let actionName = gameState.phase === GAME_PHASE.PK_SPEECH ? "PK 發言" : "發表遺言";

        if (targets.length === 1) {
            actionPanel.prompt = `請 ${targets[0]} 號玩家${actionName}`;
        } else if (targets.length > 1) {
            actionPanel.prompt = `請 ${targets.join('號、')} 號玩家${actionName}\n由 ${targets[0]} 號開始發表(號碼小的先)`;
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
        boardName: gameState.boardName,
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
        case GAME_PHASE.DAWN_SETTLEMENT: return "天亮結算中...";
        case GAME_PHASE.DAY_DISCUSSION: return "白天發言階段。";
        case GAME_PHASE.DAY_VOTING: return "正在進行放逐投票...";
        case GAME_PHASE.PK_SPEECH: return "正在進行 PK 發言...";
        case GAME_PHASE.PK_VOTING: return "正在進行 PK 投票...";
        case GAME_PHASE.VOTE_SETTLEMENT: return "投票結算中...";
        case GAME_PHASE.VOTE_RESULT_DISPLAY: return "展示投票結果...";
        case GAME_PHASE.LAST_WORDS: return "遺言發表階段。";
        case GAME_PHASE.HUNTER_ACTION: return "系統結算中..."; 
        case GAME_PHASE.GAME_OVER: return "遊戲結束。";
        default: return "等待中...";
    }
}

function handleWolfExplode(peerId) {
    const player = playersData.find(p => p.peerId === peerId);
    if (!player || player.isDead) return;
    
    const isDayPhase = [GAME_PHASE.DAWN_SETTLEMENT, GAME_PHASE.DAY_DISCUSSION, GAME_PHASE.DAY_VOTING, GAME_PHASE.PK_SPEECH, GAME_PHASE.PK_VOTING, GAME_PHASE.VOTE_RESULT_DISPLAY, GAME_PHASE.LAST_WORDS].includes(gameState.phase);
    if (!isDayPhase || !RolePlugins[player.role]?.canSelfExplode) return;

    player.isDead = true;
    player.isRevealed = true; 
    if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
    
    gameState.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇自爆！`;
    broadcastTempMessage(`【突發事件】${player.seatNumber} 號玩家選擇自爆\n發言階段立即結束！`);
    
    if (checkAndTriggerWin()) return;

    gameState.phase = GAME_PHASE.NIGHT_TRANSITION;
    syncStateToAll();
    setTimeout(startNightPhase, 4000);
}

function startNightPhase() {
    if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
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

// [核心重構] 並發時間軸分類器
function buildNightSequence() {
    const alivePlayers = playersData.filter(p => !p.isDead);
    let phases = { 'first_half': [], 'midnight': [], 'second_half': [] };
    
    alivePlayers.forEach(p => {
        const roleDef = ROLE_DICTIONARY[p.role];
        if (roleDef && roleDef.nightPhase !== 'none') {
            let existingRole = phases[roleDef.nightPhase].find(r => r.roleName === p.role);
            if (!existingRole) {
                phases[roleDef.nightPhase].push({ roleName: p.role, roleDef: roleDef, activePlayers: [p], resultLog: "" });
            } else {
                existingRole.activePlayers.push(p);
            }
        }
    });
    
    let sequence = [];
    if (phases['first_half'].length > 0) sequence.push({ phaseName: '前半夜', roles: phases['first_half'] });
    if (phases['midnight'].length > 0) sequence.push({ phaseName: '午夜 (狼人)', roles: phases['midnight'] });
    if (phases['second_half'].length > 0) sequence.push({ phaseName: '後半夜', roles: phases['second_half'] });
    
    return sequence;
}

function nextNightStep() {
    gameState.currentNightStepIndex++;
    if (gameState.currentNightStepIndex >= gameState.nightSequence.length) {
        // [核心新增] 自動白天：不需按按鈕，流程走完自動結算
        processDawn();
        return;
    }
    
    const currentPhase = gameState.nightSequence[gameState.currentNightStepIndex];
    gameState.expectedActionCount = 0;
    currentPhase.roles.forEach(roleObj => {
        gameState.expectedActionCount += roleObj.activePlayers.length;
    });

    gameState.currentStepActions = [];
    wolfPreviews = {};
    gameState.systemLog = `正在等待【${currentPhase.phaseName}】行動...`;
    
    // [核心新增] 啟動伺服器 30 秒自動結算
    if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
    gameState.nightDeadline = Date.now() + 30000;
    gameState.nightTimeout = setTimeout(handleNightTimeout, 30000);

    syncStateToAll();
}

function handleNightTimeout() {
    if (gameState.phase !== GAME_PHASE.NIGHT_ACTION) return;
    const currentPhase = gameState.nightSequence[gameState.currentNightStepIndex];
    
    // 找出尚未提交動作的玩家，強制代為提交 pass
    currentPhase.roles.forEach(roleObj => {
        roleObj.activePlayers.forEach(p => {
            const hasActed = gameState.currentStepActions.some(act => act.player.seatNumber === p.seatNumber);
            if (!hasActed) {
                gameState.currentStepActions.push({ player: p, targets: [], actionId: 'pass' });
            }
        });
    });
    resolveCurrentNightStep();
}

function resolveCurrentNightStep() {
    if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
    const currentPhase = gameState.nightSequence[gameState.currentNightStepIndex];
    let phaseLog = `【${currentPhase.phaseName}】結算完畢：`;
    
    currentPhase.roles.forEach(roleObj => {
        const plugin = RolePlugins[roleObj.roleName];
        const roleActions = gameState.currentStepActions.filter(act => act.player.role === roleObj.roleName);
        const result = plugin ? plugin.resolve(roleActions) : "【未定義】";
        roleObj.resultLog = result;
        phaseLog += `\n- ${roleObj.roleName}：${result}`;
    });
    
    gameState.systemLog = phaseLog;
    syncStateToAll();
    setTimeout(nextNightStep, 3000); // 留 3 秒給狼人看結果
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
        resolveCurrentNightStep();
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
        
        // 將刀與毒分開判定
        const isKilled = gameState.nightTags.killed.includes(seat);
        const isPoisoned = gameState.nightTags.poisoned.includes(seat);
        
        if (isKilled || isPoisoned) {
            p.isDead = true;
            deadThisNight.push(seat);
            
            // [核心修正] 只有「沒吃毒」的獵人死亡時，才能觸發開槍
            if (p.role === '獵人' && !isPoisoned) {
                hunterDied = true;
                p.isRevealed = true; 
            }
        }
    });
    
    if (checkAndTriggerWin()) return;

    gameState.lastWordsTargets = [];
    if (gameState.nightCount === 1 && deadThisNight.length > 0) {
        gameState.lastWordsTargets = [...deadThisNight];
    }

    let msg = deadThisNight.length > 0 ? `昨晚，${deadThisNight.join(' 號、')} 號玩家死亡。` : `昨晚是平安夜。`;
    gameState.systemLog = msg;
    broadcastTempMessage(msg);

    // 充置 PK 狀態
    gameState.isPK = false;

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
    if (gameState.phase !== GAME_PHASE.DAY_VOTING && gameState.phase !== GAME_PHASE.PK_VOTING) return;
    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead || gameState.votes[voter.seatNumber] !== undefined) return;
    
    // 防呆：如果是 PK 投票，且投票者是 PK 目標，拒絕
    if (gameState.phase === GAME_PHASE.PK_VOTING && gameState.pkTargets.includes(voter.seatNumber)) return;

    const target = (payload.actionId === 'vote' && payload.targets && payload.targets.length > 0) ? payload.targets[0] : 'pass';
    gameState.votes[voter.seatNumber] = target;

    // 計算預期票數
    const isPK = gameState.phase === GAME_PHASE.PK_VOTING;
    const aliveCount = playersData.filter(p => {
        if (p.isDead) return false;
        if (isPK && gameState.pkTargets.includes(p.seatNumber)) return false;
        return true;
    }).length;

    const votedCount = Object.keys(gameState.votes).length;
    gameState.systemLog = `投票進度：${votedCount} / ${aliveCount}`;

    if (votedCount >= aliveCount) resolveVoting();
    else syncStateToAll();
}

function resolveVoting() {
    let voteCounts = {};
    let voteGroups = {}; 
    let validVotesCount = 0;

    Object.entries(gameState.votes).forEach(([voter, t]) => {
        if (!voteGroups[t]) voteGroups[t] = [];
        voteGroups[t].push(voter);
        
        if (t !== 'pass') {
            voteCounts[t] = (voteCounts[t] || 0) + 1;
            validVotesCount++;
        }
    });

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;

    for (const [t, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    if (validVotesCount === 0) {
        isTie = true;
        finalTarget = null;
    }

    let resultLines = [];
    for (const [target, voters] of Object.entries(voteGroups)) {
        const targetName = target === 'pass' ? '棄票' : `${target}號`;
        const voterNames = voters.map(v => `${v}號`).join('、');
        resultLines.push(`。${voterNames} → ${targetName}`);
    }

    // [核心新增] PK 判定邏輯
    if (isTie && validVotesCount > 0 && gameState.rules.tieResolution === 'pk' && !gameState.isPK) {
        gameState.isPK = true;
        gameState.pkTargets = [];
        for (const [t, count] of Object.entries(voteCounts)) {
            if (count === maxVotes) gameState.pkTargets.push(parseInt(t));
        }
        
        gameState.currentVoteResultString = `【平票發生】\n${resultLines.join('\n')}\n\n準備進入 PK 發言。`;
        gameState.voteHistory.push(`【第 ${gameState.nightCount} 天】(首次投票)\n${gameState.currentVoteResultString}`);
        gameState.systemLog = `平票！即將進行 PK 發言。`;
        
        gameState.nextPhaseAfterVoteDisplay = GAME_PHASE.PK_SPEECH;
        gameState.phase = GAME_PHASE.VOTE_RESULT_DISPLAY;
        syncStateToAll();
        return; 
    }

    // 常規結算 (非 PK 或 PK 後仍平票)
    gameState.isPK = false;
    let header = isTie ? "投票結果出爐，平票或全數棄票，無人出局" : `投票結果出爐，${finalTarget} 號玩家出局`;
    let idiotSaved = false;
    
    gameState.pendingHunter = false;
    gameState.lastWordsTargets = [];

    if (!isTie && finalTarget) {
        const tPlayer = playersData.find(p => p.seatNumber === finalTarget);
        if (tPlayer.role === '白痴' && !tPlayer.idiotRevealed) {
            tPlayer.idiotRevealed = true;
            tPlayer.isRevealed = true; 
            idiotSaved = true;
            header = `投票結果出爐，${finalTarget} 號最高票\n觸發【白痴】免除出局`;
        } else {
            tPlayer.isDead = true;
            if (tPlayer.role === '獵人') {
                gameState.pendingHunter = true;
                tPlayer.isRevealed = true; 
            }
            gameState.lastWordsTargets = [finalTarget]; 
        }
    }
    
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
        return { title: `[${step.phaseName}]`, status: status, result: step.roles.map(r => r.roleName).join(', ') };
    });
}

function getDayBtnText() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "發起放逐投票";
    if (gameState.phase === GAME_PHASE.PK_SPEECH) return "發起 PK 投票"; // [新增]
    if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) return "結束展示，進入下一步";
    if (gameState.phase === GAME_PHASE.LAST_WORDS) return "結束遺言，進入下一階段";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "進入白天並發布死訊";
    if (gameState.phase === GAME_PHASE.HUNTER_ACTION) return "等待獵人開槍...";
    if (gameState.phase === GAME_PHASE.GAME_OVER) return "遊戲已結束"; 
    return "投票進行中...";
}

function getDayBtnDisabled() {
    return [GAME_PHASE.DAY_VOTING, GAME_PHASE.PK_VOTING, GAME_PHASE.HUNTER_ACTION, GAME_PHASE.VOTE_SETTLEMENT, GAME_PHASE.GAME_OVER].includes(gameState.phase);
}

function getDayBtnCommand() {
    if (gameState.phase === GAME_PHASE.DAY_DISCUSSION) return "START_VOTE";
    if (gameState.phase === GAME_PHASE.PK_SPEECH) return "START_PK_VOTE"; // [新增]
    if (gameState.phase === GAME_PHASE.VOTE_RESULT_DISPLAY) return "END_VOTE_DISPLAY";
    if (gameState.phase === GAME_PHASE.LAST_WORDS) return "END_LAST_WORDS";
    if (gameState.phase === GAME_PHASE.DAWN_SETTLEMENT) return "PROCESS_DAWN"; 
    return "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT') {
        if(gameState.nightTimeout) clearTimeout(gameState.nightTimeout);
        handleNightTimeout(); // 呼叫超時自動填入機制
    } 
    else if (cmd === 'START_VOTE') {
        gameState.phase = GAME_PHASE.DAY_VOTING;
        gameState.votes = {};
        gameState.systemLog = "正在進行放逐投票...";
        syncStateToAll();
    } 
    else if (cmd === 'START_PK_VOTE') {
        gameState.phase = GAME_PHASE.PK_VOTING;
        gameState.votes = {};
        gameState.systemLog = "正在進行 PK 投票...";
        syncStateToAll();
    }
    else if (cmd === 'END_VOTE_DISPLAY') {
        // [新增] 判斷是否需要進入 PK
        if (gameState.nextPhaseAfterVoteDisplay) {
            gameState.phase = gameState.nextPhaseAfterVoteDisplay;
            gameState.nextPhaseAfterVoteDisplay = null;
            if (gameState.phase === GAME_PHASE.PK_SPEECH) {
                 gameState.systemLog = `請 ${gameState.pkTargets.join('、')} 號進行 PK 發言。`;
            }
        }
        else if (gameState.pendingHunter) {
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