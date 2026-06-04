let hostPeer = null;
let connections = {};
let playersData = [];
let currentRoomId = null;

let gameState = { ...GAME_STATE };
let availableRoles = [];
let thiefSpareCards = []; 

function initHost(roomId) {
    hostPeer = new Peer(roomId, peerConfig);
    hostPeer.on('open', (id) => {
        currentRoomId = id;
        document.getElementById('display-room-id').textContent = id;
        UI.updateStatusMessage('房間建立成功，等待玩家加入...');
        
        // 渲染初始空圓桌
        UI.renderPlayerGrid('host-players-grid', playersData, true);
    });
    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        setupHostConnectionListeners(conn);
    });
    hostPeer.on('error', (err) => {
        alert('建立房間失敗，可能是房間號碼已被使用。');
    });
}

function setupHostConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case 'JOIN_ROOM': handlePlayerJoin(conn.peer, data.payload.name); break;
            case 'ACTION_COMPLETE': handleNightActionComplete(conn.peer, data.payload); break;
            case 'VOTE_SUBMIT': handleVoteSubmit(conn.peer, data.payload); break;
            case 'TRIGGER_SELF_DESTRUCT': handleSelfDestruct(conn.peer); break;
            case 'DAY_SKILL_ACTION': handleDaySkillAction(conn.peer, data.payload); break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    const seatNumber = playersData.length + 1;
    playersData.push({ seatNumber: seatNumber, peerId: peerId, name: playerName, role: null, isDead: false, isSilenced: false });
    sendToPlayer(peerId, { type: 'JOIN_SUCCESS', payload: { seatNumber: seatNumber } });
    broadcastToAll({ type: 'LOBBY_UPDATE', payload: { players: getPublicPlayersData() } });
    UI.renderPlayerGrid('host-players-grid', playersData, true);
}

function startGame(selectedRoles) {
    if (selectedRoles.length !== playersData.length && !(selectedRoles.includes("盜賊") && selectedRoles.length === playersData.length + 2)) {
        return alert('角色數量與玩家人數不符！');
    }
    availableRoles = [...selectedRoles];
    let isValidDeal = false;
    let shuffledRoles = [];
    while (!isValidDeal) {
        shuffledRoles = shuffleArray([...availableRoles]);
        isValidDeal = validateThiefDeal(shuffledRoles);
    }
    playersData.forEach((player, index) => player.role = shuffledRoles[index]);
    if (availableRoles.includes("盜賊")) thiefSpareCards = [shuffledRoles[shuffledRoles.length - 2], shuffledRoles[shuffledRoles.length - 1]];
    
    broadcastToAll({ type: 'GAME_INIT', payload: { players: getPublicPlayersData() } });
    playersData.forEach(player => {
        sendToPlayer(player.peerId, { type: 'GAME_INIT', payload: { seatNumber: player.seatNumber, role: player.role, players: getPublicPlayersData() } });
    });
    UI.renderPlayerGrid('host-players-grid', playersData, true);
    alert('發牌完成！請玩家確認身分，10秒後進入首夜。');
    setTimeout(startNightPhase, 10000); 
}

function validateThiefDeal(shuffled) {
    if (!shuffled.includes("盜賊")) return true;
    const spare1 = shuffled[shuffled.length - 2];
    const spare2 = shuffled[shuffled.length - 1];
    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
    if (wolfRoles.includes(spare1) && wolfRoles.includes(spare2)) return false;
    return true;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getPublicPlayersData() { return playersData.map(p => ({ seatNumber: p.seatNumber, name: p.name, role: p.role, isDead: p.isDead })); }
function broadcastToAll(data) { playersData.forEach(p => { if (connections[p.peerId]) connections[p.peerId].send(data); }); }
function sendToPlayer(peerId, data) { if (connections[peerId]) connections[peerId].send(data); }

let nightSequence = [];
let currentNightStep = 0;
let expectedActionResponses = 0;
let nightTags = { guarded: [], killed: [], poisoned: [], dreamed: [], revenged: null, witchUsedSaveTonight: false };

function startNightPhase() {
    broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'night' } });
    document.getElementById('day-dashboard').classList.add('hidden');
    document.getElementById('night-dashboard').classList.remove('hidden');
    nightSequence = buildNightSequence();
    UI.renderNightFlow(nightSequence, 0);
    currentNightStep = 0;
    expectedActionResponses = 0;
    nightTags = { guarded: [], killed: [], poisoned: [], dreamed: [], revenged: null, witchUsedSaveTonight: false };
    document.getElementById('btn-start-night').classList.add('hidden');
    processNextNightStep();
}

function buildNightSequence() {
    let sequence = [];
    const alivePlayers = playersData.filter(p => !p.isDead);
    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
    const aliveWolves = alivePlayers.filter(p => wolfRoles.includes(p.role));

    if (aliveWolves.length < 3) gameState.isWolfCrowAwake = true;

    for (let order = 1; order <= 21; order++) {
        if (order === 11 && aliveWolves.length > 0) {
            sequence.push({ order: 11, name: "狼人陣營", players: aliveWolves, roleDef: ROLE_DICTIONARY["狼人"] });
            continue;
        }
        if (order === 21 && gameState.merchantGiftTarget) {
            const luckyBoy = alivePlayers.find(p => p.seatNumber === gameState.merchantGiftTarget);
            if (luckyBoy && !gameState.isMerchantUsed) {
                let inheritedRoleDef = null;
                if (gameState.merchantGiftType === 'seer') inheritedRoleDef = ROLE_DICTIONARY["預言家"];
                if (gameState.merchantGiftType === 'poison') inheritedRoleDef = ROLE_DICTIONARY["女巫-毒藥"];
                if (gameState.merchantGiftType === 'guard') inheritedRoleDef = ROLE_DICTIONARY["守衛"];
                if (inheritedRoleDef) sequence.push({ order: 21, name: "幸運兒", players: [luckyBoy], roleDef: inheritedRoleDef });
            }
            continue;
        }
        let currentStepPlayers = [];
        let currentRoleDef = null;
        let currentRoleName = "";
        alivePlayers.forEach(p => {
            for (const [roleName, roleDef] of Object.entries(ROLE_DICTIONARY)) {
                const isMatch = (p.role === roleName) || (roleName.startsWith(p.role + "-"));
                if (roleDef.wakeOrder === order && isMatch) {
                    if (roleName === "狼鴉之爪-復仇" && !gameState.isWolfCrowAwake) return;
                    currentStepPlayers.push(p);
                    currentRoleDef = roleDef;
                    currentRoleName = roleName;
                }
            }
        });
        if (currentStepPlayers.length > 0) sequence.push({ order: order, name: currentRoleName, players: currentStepPlayers, roleDef: currentRoleDef });
    }
    return sequence;
}

function processNextNightStep() {
    if (currentNightStep >= nightSequence.length) {
        UI.updateNightFlowStatus('all', '結束');
        document.getElementById('btn-end-night').classList.remove('hidden');
        broadcastToAll({ type: 'SLEEP', payload: {} });
        return;
    }
    const stepData = nightSequence[currentNightStep];
    UI.renderNightFlow(nightSequence, stepData.order);
    broadcastToAll({ type: 'SLEEP', payload: {} });
    expectedActionResponses = stepData.players.length;

    stepData.players.forEach(player => {
        let payloadData = { roleDef: JSON.parse(JSON.stringify(stepData.roleDef)), specialOptions: null };
        
        if (stepData.order === 1) {
            payloadData.specialOptions = thiefSpareCards.map(card => ({ label: card, value: card, disabled: (card !== "狼人" && thiefSpareCards.includes("狼人")) }));
        }
        
        // 動態替換女巫解藥提示
        if (stepData.name === "女巫-解藥") {
            const victim = nightTags.killed.length > 0 ? nightTags.killed[0] : "無";
            payloadData.roleDef.prompt = `昨晚被襲擊的是 ${victim} 號，是否使用解藥？(點選該號碼使用解藥，或點選放棄)`;
        }

        sendToPlayer(player.peerId, { type: 'WAKE_UP', payload: payloadData });
    });
}

let currentStepActions = [];

function handleNightActionComplete(peerId, payload) {
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    if (!actingPlayer) return;
    currentStepActions.push({ player: actingPlayer, targets: payload.targets || [], specialValue: payload.specialValue || null });
    expectedActionResponses--;
    if (expectedActionResponses <= 0) {
        evaluateStepActions();
        currentStepActions = []; 
        currentNightStep++;
        setTimeout(processNextNightStep, 1500); 
    }
}

function evaluateStepActions() {
    if (currentStepActions.length === 0) return;
    const stepData = nightSequence[currentNightStep];
    const roleName = stepData.name;

    if (stepData.order === 11) {
        let targetCounts = {};
        currentStepActions.forEach(action => {
            if (action.targets.length > 0) {
                const t = action.targets[0];
                targetCounts[t] = (targetCounts[t] || 0) + 1;
            }
        });
        let maxVotes = 0;
        let finalTarget = null;
        for (const [t, votes] of Object.entries(targetCounts)) {
            if (votes > maxVotes) { maxVotes = votes; finalTarget = parseInt(t); }
        }
        if (finalTarget) nightTags.killed.push(finalTarget);
        return;
    }

    const action = currentStepActions[0];
    const target = action.targets.length > 0 ? action.targets[0] : null;

    switch (roleName) {
	case "盜賊":
            if (action.specialValue) {
                action.player.role = action.specialValue;
                sendToPlayer(action.player.peerId, { 
                    type: 'GAME_INIT', 
                    payload: { seatNumber: action.player.seatNumber, role: action.player.role, players: getPublicPlayersData() } 
                });
            }
            break;        case "烏鴉":
            if (target) gameState.crowTarget = target;
            break;
        case "奇蹟商人":
            if (target && action.specialValue) {
                const targetPlayer = playersData.find(p => p.seatNumber === target);
                const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
                if (targetPlayer && wolfRoles.includes(targetPlayer.role)) {
                    nightTags.killed.push(action.player.seatNumber);
                } else {
                    gameState.merchantGiftTarget = target;
                    gameState.merchantGiftType = action.specialValue;
                }
            }
            break;
        case "守衛":
            if (target) nightTags.guarded.push(target);
            break;
        case "女巫-解藥":
            if (target) {
                nightTags.killed = nightTags.killed.filter(id => id !== target);
                nightTags.witchUsedSaveTonight = true;
            }
            break;
        case "女巫-毒藥":
            if (target) {
                if (nightTags.witchUsedSaveTonight) {
                    sendToPlayer(action.player.peerId, { type: 'PHASE_CHANGE', payload: { phase: 'night', message: '系統提示：女巫不可在同一晚使用兩瓶藥，毒藥失效。' } });
                } else {
                    nightTags.poisoned.push(target);
                }
            }
            break;
        case "攝夢人":
            if (target) nightTags.dreamed.push(target);
            break;
        case "狼鴉之爪-復仇":
            if (target) nightTags.revenged = target;
            break;
        case "預言家":
        case "純白之女":
            if (target) {
                const targetPlayer = playersData.find(p => p.seatNumber === target);
                let resultMsg = "";
                if (roleName === "純白之女") {
                    resultMsg = `查驗結果：目標的具體身分是【${targetPlayer.role}】`;
                } else {
                    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
                    const isWolf = wolfRoles.includes(targetPlayer.role) && targetPlayer.role !== "隱狼";
                    resultMsg = `查驗結果：該玩家為【${isWolf ? "狼人" : "好人"}】陣營`;
                    if (targetPlayer.role === "咒狐") nightTags.killed.push(target);
                }
                sendToPlayer(action.player.peerId, { type: 'PHASE_CHANGE', payload: { phase: 'night', message: resultMsg } });
            }
            break;
        case "幸運兒":
            if (target) {
                gameState.isMerchantUsed = true;
                if (gameState.merchantGiftType === 'guard') nightTags.guarded.push(target);
                if (gameState.merchantGiftType === 'poison') nightTags.poisoned.push(target);
                if (gameState.merchantGiftType === 'seer') {
                    const targetPlayer = playersData.find(p => p.seatNumber === target);
                    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
                    const isWolf = wolfRoles.includes(targetPlayer.role) && targetPlayer.role !== "隱狼";
                    if (targetPlayer.role === "咒狐") nightTags.killed.push(target);
                    sendToPlayer(action.player.peerId, { type: 'PHASE_CHANGE', payload: { phase: 'night', message: `查驗結果：該玩家為【${isWolf ? "狼人" : "好人"}】陣營` } });
                }
            }
            break;
    }
}

function processDawnSettlement() {
    let deadPlayersThisNight = [];
    playersData.forEach(player => {
        if (player.isDead) return;
        const seat = player.seatNumber;
        let isDying = false;

        if (nightTags.revenged === seat) {
            isDying = true;
            player.isSilenced = true; 
        } else {
            const isTargetedByWolf = nightTags.killed.includes(seat);
            const isPoisoned = nightTags.poisoned.includes(seat);
            const isGuarded = nightTags.guarded.includes(seat);

            if (player.role === "咒狐") {
                if (isTargetedByWolf || isPoisoned) {
                    if (!nightTags.killedBySeer) isDying = false; 
                    else isDying = true;
                }
                if (nightTags.killed.includes(seat)) isDying = true; 
            } else {
                if (isTargetedByWolf && !isGuarded) isDying = true;
                if (isPoisoned) isDying = true;
            }
        }
        if (isDying) {
            player.isDead = true;
            deadPlayersThisNight.push(seat);
        }
    });

    if (gameState.isBloodMoonActive) {
        playersData.forEach(p => p.isSilenced = false);
        gameState.isBloodMoonActive = false;
    }

    UI.renderPlayerGrid('host-players-grid', playersData, true);
    let resultMsg = deadPlayersThisNight.length > 0 ? `昨晚，${deadPlayersThisNight.join(', ')} 號玩家死亡。` : `昨晚是平安夜。`;
    broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'day', message: resultMsg } });
    deadPlayersThisNight.forEach(seat => broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: seat } }));
    startDayPhase();
}

let currentVotes = {};

function startDayPhase() {
    document.getElementById('night-dashboard').classList.add('hidden');
    document.getElementById('day-dashboard').classList.remove('hidden');
    document.getElementById('vote-results-container').innerHTML = '';
    currentVotes = {};
}

document.getElementById('btn-start-vote')?.addEventListener('click', () => {
    const alivePlayers = getPublicPlayersData().filter(p => !p.isDead);
    broadcastToAll({ type: 'START_VOTE', payload: { alivePlayers } });
    UI.updateStatusMessage('正在進行暗投，等待玩家提交...');
    document.getElementById('vote-results-container').innerHTML = `<p>投票進度：0 / ${alivePlayers.length}</p>`;
});

function handleVoteSubmit(peerId, payload) {
    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead) return;
    currentVotes[voter.seatNumber] = payload.target;
    
    const aliveCount = playersData.filter(p => !p.isDead).length;
    const votedCount = Object.keys(currentVotes).length;
    document.getElementById('vote-results-container').innerHTML = `<p>投票進度：${votedCount} / ${aliveCount}</p>`;

    if (votedCount >= aliveCount) calculateVoteResults();
}

function calculateVoteResults() {
    broadcastToAll({ type: 'END_VOTE', payload: {} });
    let voteCounts = {};
    Object.values(currentVotes).forEach(target => {
        if (target !== 'abstain') voteCounts[target] = (voteCounts[target] || 0) + 1;
    });

    if (gameState.crowTarget) {
        voteCounts[gameState.crowTarget] = (voteCounts[gameState.crowTarget] || 0) + 1;
        gameState.crowTarget = null; 
    }

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;
    for (const [target, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(target); isTie = false; }
        else if (count === maxVotes) { isTie = true; }
    }

    const resultContainer = document.getElementById('vote-results-container');
    if (isTie || !finalTarget) {
        resultContainer.innerHTML = `<p>投票結果：平票或全數棄票，無人出局。</p>`;
    } else {
        const targetPlayer = playersData.find(p => p.seatNumber === finalTarget);
        if (targetPlayer && targetPlayer.role === "白痴") {
            resultContainer.innerHTML = `<p>投票結果：${finalTarget} 號最高票。觸發【白痴】技能，免除出局。</p>`;
        } else {
            resultContainer.innerHTML = `<p>投票結果：${finalTarget} 號玩家被放逐出局。</p>`;
            targetPlayer.isDead = true;
            broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: finalTarget } });
            UI.renderPlayerGrid('host-players-grid', playersData, true);
        }
    }
}

function handleDaySkillAction(peerId, payload) {
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    
    // 處理定序王子
    if (actingPlayer.role === '定序王子' && payload.skill === 'prince') {
        if (gameState.isPrinceUsed) return;
        gameState.isPrinceUsed = true;
        currentVotes = {}; 
        broadcastToAll({ type: 'END_VOTE', payload: {} });
        broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'day', message: `【定序王子】發動技能！本次投票作廢，請重新組織發言或發起投票。` } });
        document.getElementById('vote-results-container').innerHTML = '<p style="color:var(--accent-red);">定序王子發動技能，本次投票已被作廢。</p>';
        return;
    }

    // 處理騎士
    if (actingPlayer.role === '騎士' && payload.targets && payload.targets.length > 0) {
        const target = payload.targets[0];
        const targetPlayer = playersData.find(p => p.seatNumber === target);
        const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人", "惡靈騎士", "噩夢之影", "血月使徒", "蝕時狼妃", "狼鴉之爪"];
        const isWolf = wolfRoles.includes(targetPlayer.role) && targetPlayer.role !== "隱狼";
        
        let msg = `【騎士決鬥】騎士 ${actingPlayer.seatNumber} 號對 ${target} 號發起決鬥！`;
        if (isWolf) {
            msg += ` 目標為狼人，${target} 號玩家死亡，直接進入黑夜！`;
            targetPlayer.isDead = true;
            broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: target } });
            broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'day', message: msg } });
            UI.renderPlayerGrid('host-players-grid', playersData, true);
            setTimeout(startNightPhase, 4000);
        } else {
            msg += ` 目標為好人，騎士 ${actingPlayer.seatNumber} 號玩家死亡，白天繼續！`;
            actingPlayer.isDead = true;
            broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: actingPlayer.seatNumber } });
            broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'day', message: msg } });
            UI.renderPlayerGrid('host-players-grid', playersData, true);
        }
    }
}

function handleSelfDestruct(peerId) {
    const player = playersData.find(p => p.peerId === peerId);
    if (!player || player.isDead) return;
    player.isDead = true;
    UI.renderPlayerGrid('host-players-grid', playersData, true);
    
    let msg = `${player.seatNumber} 號玩家自爆！`;
    if (player.role === "血月使徒") {
        gameState.isBloodMoonActive = true;
        msg += " 觸發血月封鎖，今晚好人陣營無法使用技能。";
    }
    broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'day', message: msg } });
    broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: player.seatNumber } });
    setTimeout(startNightPhase, 3000);
}

document.getElementById('btn-end-night')?.addEventListener('click', processDawnSettlement);
document.getElementById('btn-end-day')?.addEventListener('click', startNightPhase);
document.getElementById('btn-interrupt-skill')?.addEventListener('click', () => {
    if(confirm('是否要作廢本次投票或執行白天中斷技能？')) {
        currentVotes = {};
        document.getElementById('vote-results-container').innerHTML = '<p>主持人已作廢本次流程，請重新發言或進行階段。</p>';
    }
});