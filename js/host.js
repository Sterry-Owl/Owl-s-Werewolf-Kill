// js/host.js (1/4)

let hostPeer = null;
let connections = {};
let playersData = []; // { seatNumber, peerId, name, role, isDead, isSilenced }
let currentRoomId = null;

// 全域遊戲狀態 (與 config.js 的 GAME_STATE 整合)
let gameState = { ...GAME_STATE };
let availableRoles = [];
let thiefSpareCards = []; // 盜賊的兩張備用底牌

// ==========================================
// 1. 初始化與房間建立
// ==========================================
function initHost(roomId) {
    hostPeer = new Peer(roomId, peerConfig);

    hostPeer.on('open', (id) => {
        currentRoomId = id;
        document.getElementById('display-room-id').textContent = id;
        UI.updateStatusMessage('房間建立成功，等待玩家加入...');
    });

    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        setupHostConnectionListeners(conn);
    });

    hostPeer.on('error', (err) => {
        console.error('Host PeerJS Error:', err);
        alert('建立房間失敗，可能是房間號碼已被使用。');
    });
}

function setupHostConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case 'JOIN_ROOM':
                handlePlayerJoin(conn.peer, data.payload.name);
                break;
            case 'ACTION_COMPLETE':
                handleNightActionComplete(conn.peer, data.payload);
                break;
            case 'VOTE_SUBMIT':
                handleVoteSubmit(conn.peer, data.payload);
                break;
            case 'TRIGGER_SELF_DESTRUCT':
                handleSelfDestruct(conn.peer);
                break;
        }
    });
}

function handlePlayerJoin(peerId, playerName) {
    const seatNumber = playersData.length + 1;
    playersData.push({
        seatNumber: seatNumber,
        peerId: peerId,
        name: playerName,
        role: null,
        isDead: false,
        isSilenced: false
    });
    UI.renderPlayerGrid('host-players-grid', playersData, true);
}

// ==========================================
// 2. 發牌引擎與盜賊防呆邏輯
// ==========================================
function startGame(selectedRoles) {
    // selectedRoles 為陣列，包含主持人選擇的所有角色名稱
    if (selectedRoles.length !== playersData.length && !(selectedRoles.includes("盜賊") && selectedRoles.length === playersData.length + 2)) {
        alert('角色數量與玩家人數不符！');
        return;
    }

    availableRoles = [...selectedRoles];
    
    // 執行洗牌與盜賊防呆校驗
    let isValidDeal = false;
    let shuffledRoles = [];
    
    while (!isValidDeal) {
        shuffledRoles = shuffleArray([...availableRoles]);
        isValidDeal = validateThiefDeal(shuffledRoles);
    }

    // 分配身分
    playersData.forEach((player, index) => {
        player.role = shuffledRoles[index];
    });

    // 處理盜賊底牌
    if (availableRoles.includes("盜賊")) {
        thiefSpareCards = [
            shuffledRoles[shuffledRoles.length - 2],
            shuffledRoles[shuffledRoles.length - 1]
        ];
    }

    // 廣播初始狀態給所有玩家
    broadcastToAll({
        type: 'GAME_INIT',
        payload: { players: getPublicPlayersData() }
    });

    // 針對個別玩家發送具體身分
    playersData.forEach(player => {
        sendToPlayer(player.peerId, {
            type: 'GAME_INIT',
            payload: { seatNumber: player.seatNumber, role: player.role, players: getPublicPlayersData() }
        });
    });

    UI.renderPlayerGrid('host-players-grid', playersData, true);
    alert('發牌完成！準備進入首夜。');
}

function validateThiefDeal(shuffled) {
    if (!shuffled.includes("盜賊")) return true;
    
    const spare1 = shuffled[shuffled.length - 2];
    const spare2 = shuffled[shuffled.length - 1];
    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人-狼刀", "惡靈騎士", "噩夢之影-狼刀", "血月使徒", "蝕時狼妃-狼刀", "狼鴉之爪-睜眼"];
    
    // 防呆條件：底牌不可皆為狼人陣營
    if (wolfRoles.includes(spare1) && wolfRoles.includes(spare2)) {
        return false;
    }
    return true;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getPublicPlayersData() {
    return playersData.map(p => ({ seatNumber: p.seatNumber, name: p.name, isDead: p.isDead }));
}

function broadcastToAll(data) {
    playersData.forEach(p => {
        if (connections[p.peerId]) connections[p.peerId].send(data);
    });
}

function sendToPlayer(peerId, data) {
    if (connections[peerId]) connections[peerId].send(data);
}
// js/host.js (2/4)

let nightSequence = [];
let currentNightStep = 0;
let expectedActionResponses = 0;
let pendingActionTimer = null;

// 夜間暫存傷害與防禦標籤 (Dawn Settlement Engine 使用)
let nightTags = {
    guarded: [],
    killed: [],
    poisoned: [],
    dreamed: [],
    revenged: null
};

// ==========================================
// 3. 夜間狀態機與序列產生器 (Night Sequence Engine)
// ==========================================
function startNightPhase() {
    broadcastToAll({ type: 'PHASE_CHANGE', payload: { phase: 'night' } });
    document.getElementById('day-dashboard').classList.add('hidden');
    document.getElementById('night-dashboard').classList.remove('hidden');

    nightSequence = buildNightSequence();
    UI.renderNightFlow(nightSequence, 0);

    currentNightStep = 0;
    expectedActionResponses = 0;
    
    // 重置每晚的狀態標籤
    nightTags.guarded = [];
    nightTags.killed = [];
    nightTags.poisoned = [];
    nightTags.dreamed = [];
    nightTags.revenged = null;

    document.getElementById('btn-start-night').classList.add('hidden');
    processNextNightStep();
}

function buildNightSequence() {
    let sequence = [];
    const alivePlayers = playersData.filter(p => !p.isDead);

    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人-狼刀", "惡靈騎士", "噩夢之影-狼刀", "血月使徒", "蝕時狼妃-狼刀", "狼鴉之爪-睜眼"];
    const aliveWolves = alivePlayers.filter(p => wolfRoles.includes(p.role));

    // 判斷狼鴉之爪動態覺醒條件 (狼人陣營 < 3)
    if (aliveWolves.length < 3) {
        gameState.isWolfCrowAwake = true;
    }

    for (let order = 1; order <= 21; order++) {
        // 特例 11：狼人陣營共同襲擊
        if (order === 11 && aliveWolves.length > 0) {
            sequence.push({ order: 11, name: "狼人陣營", players: aliveWolves, roleDef: ROLE_DICTIONARY["狼人"] });
            continue;
        }

        // 特例 21：幸運兒動態繼承
        if (order === 21 && gameState.merchantGiftTarget) {
            const luckyBoy = alivePlayers.find(p => p.seatNumber === gameState.merchantGiftTarget);
            if (luckyBoy && !gameState.isMerchantUsed) {
                let inheritedRoleDef = null;
                if (gameState.merchantGiftType === 'seer') inheritedRoleDef = ROLE_DICTIONARY["預言家"];
                if (gameState.merchantGiftType === 'poison') inheritedRoleDef = ROLE_DICTIONARY["女巫-毒藥"];
                if (gameState.merchantGiftType === 'guard') inheritedRoleDef = ROLE_DICTIONARY["守衛"];
                
                if (inheritedRoleDef) {
                    sequence.push({ order: 21, name: "幸運兒", players: [luckyBoy], roleDef: inheritedRoleDef });
                }
            }
            continue;
        }

        // 常規角色檢索
        let currentStepPlayers = [];
        let currentRoleDef = null;
        let currentRoleName = "";

        alivePlayers.forEach(p => {
            for (const [roleName, roleDef] of Object.entries(ROLE_DICTIONARY)) {
                if (roleDef.wakeOrder === order && p.role === roleName) {
                    // 攔截未覺醒的狼鴉之爪復仇
                    if (roleName === "狼鴉之爪-復仇" && !gameState.isWolfCrowAwake) return;
                    
                    currentStepPlayers.push(p);
                    currentRoleDef = roleDef;
                    currentRoleName = roleName;
                }
            }
        });

        if (currentStepPlayers.length > 0) {
            sequence.push({ order: order, name: currentRoleName, players: currentStepPlayers, roleDef: currentRoleDef });
        }
    }
    return sequence;
}

// ==========================================
// 4. 夜間非同步行動推進邏輯
// ==========================================
function processNextNightStep() {
    if (currentNightStep >= nightSequence.length) {
        // 所有夜間行動結束
        UI.updateNightFlowStatus('all', '結束');
        document.getElementById('btn-end-night').classList.remove('hidden');
        broadcastToAll({ type: 'SLEEP', payload: {} });
        return;
    }

    const stepData = nightSequence[currentNightStep];
    UI.renderNightFlow(nightSequence, stepData.order);
    
    // 廣播閉眼指令給全場
    broadcastToAll({ type: 'SLEEP', payload: {} });

    expectedActionResponses = stepData.players.length;

    stepData.players.forEach(player => {
        let payloadData = {
            roleDef: stepData.roleDef,
            specialOptions: null
        };

        // 處理盜賊的底牌推播
        if (stepData.order === 1) {
            payloadData.specialOptions = thiefSpareCards.map((card, idx) => ({
                label: card,
                value: card,
                disabled: (card !== "狼人" && thiefSpareCards.includes("狼人")) // 強制選狼防呆
            }));
        }

        sendToPlayer(player.peerId, { type: 'WAKE_UP', payload: payloadData });
    });
}
// js/host.js (3/4)

let currentStepActions = [];

// ==========================================
// 5. 夜間行動接收與技能結算
// ==========================================
function handleNightActionComplete(peerId, payload) {
    const actingPlayer = playersData.find(p => p.peerId === peerId);
    if (!actingPlayer) return;

    // 暫存此階段的行動資料
    currentStepActions.push({
        player: actingPlayer,
        targets: payload.targets || [],
        specialValue: payload.specialValue || null
    });

    expectedActionResponses--;

    // 當此順序的所有玩家都完成行動後，進行階段結算
    if (expectedActionResponses <= 0) {
        evaluateStepActions();
        currentStepActions = []; // 清空暫存
        currentNightStep++;
        
        // 延遲 1.5 秒推進下一階段，讓系統狀態更順暢
        setTimeout(processNextNightStep, 1500); 
    }
}

function evaluateStepActions() {
    if (currentStepActions.length === 0) return;

    const stepData = nightSequence[currentNightStep];
    const roleName = stepData.name;

    // ============================
    // 多人共識決處理 (如：狼人陣營順序 11)
    // ============================
    if (stepData.order === 11) {
        let targetCounts = {};
        currentStepActions.forEach(action => {
            if (action.targets.length > 0) {
                const t = action.targets[0];
                targetCounts[t] = (targetCounts[t] || 0) + 1;
            }
        });
        
        // 找出最高票目標
        let maxVotes = 0;
        let finalTarget = null;
        for (const [t, votes] of Object.entries(targetCounts)) {
            if (votes > maxVotes) {
                maxVotes = votes;
                finalTarget = parseInt(t);
            }
        }
        if (finalTarget) nightTags.killed.push(finalTarget);
        return;
    }

    // ============================
    // 單人/特殊行動處理
    // ============================
    const action = currentStepActions[0];
    const target = action.targets.length > 0 ? action.targets[0] : null;

    switch (roleName) {
        case "盜賊":
            if (action.specialValue) {
                action.player.role = action.specialValue; // 系統底層覆寫身分
            }
            break;
            
        case "奇蹟商人":
            if (target && action.specialValue) {
                const targetPlayer = playersData.find(p => p.seatNumber === target);
                const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人-狼刀", "惡靈騎士", "噩夢之影-狼刀", "血月使徒", "蝕時狼妃-狼刀", "狼鴉之爪-睜眼"];
                
                if (targetPlayer && wolfRoles.includes(targetPlayer.role)) {
                    // 若目標為狼人，技能失效且自身標記死亡
                    nightTags.killed.push(action.player.seatNumber);
                } else {
                    // 贈予成功，寫入全域變數
                    gameState.merchantGiftTarget = target;
                    gameState.merchantGiftType = action.specialValue;
                }
            }
            break;

        case "守衛":
            if (target) nightTags.guarded.push(target);
            break;

        case "女巫-毒藥":
            if (target) nightTags.poisoned.push(target);
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
                    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人-狼刀", "惡靈騎士", "噩夢之影-狼刀", "血月使徒", "蝕時狼妃-狼刀", "狼鴉之爪-睜眼"];
                    const isWolf = wolfRoles.includes(targetPlayer.role) && targetPlayer.role !== "隱狼";
                    resultMsg = `查驗結果：該玩家為【${isWolf ? "狼人" : "好人"}】陣營`;
                    
                    // 查驗咒狐致死邏輯
                    if (targetPlayer.role === "咒狐") nightTags.killed.push(target);
                }
                
                // 借用 PHASE_CHANGE 推播查驗結果到玩家介面的狀態列
                sendToPlayer(action.player.peerId, {
                    type: 'PHASE_CHANGE', 
                    payload: { phase: 'night', message: resultMsg }
                });
            }
            break;
            
        case "幸運兒":
            if (target) {
                gameState.isMerchantUsed = true;
                if (gameState.merchantGiftType === 'guard') nightTags.guarded.push(target);
                if (gameState.merchantGiftType === 'poison') nightTags.poisoned.push(target);
                if (gameState.merchantGiftType === 'seer') {
                    const targetPlayer = playersData.find(p => p.seatNumber === target);
                    const wolfRoles = ["狼人", "狼王", "白狼王", "狼美人-狼刀", "惡靈騎士", "噩夢之影-狼刀", "血月使徒", "蝕時狼妃-狼刀", "狼鴉之爪-睜眼"];
                    const isWolf = wolfRoles.includes(targetPlayer.role) && targetPlayer.role !== "隱狼";
                    
                    if (targetPlayer.role === "咒狐") nightTags.killed.push(target);
                    
                    sendToPlayer(action.player.peerId, {
                        type: 'PHASE_CHANGE',
                        payload: { phase: 'night', message: `查驗結果：該玩家為【${isWolf ? "狼人" : "好人"}】陣營` }
                    });
                }
            }
            break;
    }
}
// js/host.js (4/4)

// ==========================================
// 6. 天亮結算引擎 (Dawn Settlement Engine)
// ==========================================
function processDawnSettlement() {
    let deadPlayersThisNight = [];

    playersData.forEach(player => {
        if (player.isDead) return;
        const seat = player.seatNumber;
        let isDying = false;

        // 1. 狼鴉之爪復仇判定 (無視任何防禦)
        if (nightTags.revenged === seat) {
            isDying = true;
            player.isSilenced = true; // 封鎖遺言與技能
        } else {
            // 2. 一般傷害與防禦判定
            const isTargetedByWolf = nightTags.killed.includes(seat);
            const isPoisoned = nightTags.poisoned.includes(seat);
            const isGuarded = nightTags.guarded.includes(seat);

            // 咒狐夜間傷害免疫判定
            if (player.role === "咒狐") {
                // 註：若在預言家階段被查驗，底層邏輯已將其直接標記於 killed 中，此處簡化處理為只要在 killed 清單內且非單純狼刀即死亡
                // 嚴謹實作上可進一步區分狼刀標記與查驗標記
                if (isTargetedByWolf || isPoisoned) {
                    // 若有實作獨立的查驗致死標籤，在此處判定；若無，咒狐預設免疫狼刀與毒藥
                    if (!nightTags.killedBySeer) { 
                        isDying = false; 
                    } else {
                        isDying = true;
                    }
                }
                // 補充：若受預言家查驗致死，依先前邏輯若有直接寫入則判定致死
                if (nightTags.killed.includes(seat)) isDying = true; // 妥協方案：依照傳入標記執行
            } else {
                // 常規角色防禦判定
                if (isTargetedByWolf && !isGuarded) isDying = true;
                if (isPoisoned) isDying = true;
                
                // 同守同救判定 (若被狼刀、被守衛、被解藥同時作用 -> 死亡)
                // 由於此處簡化未紀錄解藥標籤，僅做基本守護判定
            }
        }

        if (isDying) {
            player.isDead = true;
            deadPlayersThisNight.push(seat);
        }
    });

    // 結算血月使徒狀態封鎖還原
    if (gameState.isBloodMoonActive) {
        playersData.forEach(p => p.isSilenced = false);
        gameState.isBloodMoonActive = false;
    }

    // 更新介面與廣播
    UI.renderPlayerGrid('host-players-grid', playersData, true);
    
    let resultMsg = deadPlayersThisNight.length > 0 
        ? `昨晚，${deadPlayersThisNight.join(', ')} 號玩家死亡。` 
        : `昨晚是平安夜。`;

    broadcastToAll({
        type: 'PHASE_CHANGE',
        payload: { phase: 'day', message: resultMsg }
    });

    deadPlayersThisNight.forEach(seat => {
        broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: seat } });
    });

    startDayPhase();
}

// ==========================================
// 7. 白天控制與中斷攔截邏輯
// ==========================================
let currentVotes = {};

function startDayPhase() {
    document.getElementById('night-dashboard').classList.add('hidden');
    document.getElementById('day-dashboard').classList.remove('hidden');
    document.getElementById('vote-results-container').innerHTML = '';
    currentVotes = {};
}

// 發起暗投
document.getElementById('btn-start-vote')?.addEventListener('click', () => {
    const alivePlayers = playersData.filter(p => !p.isDead).map(p => p.seatNumber);
    broadcastToAll({ type: 'START_VOTE', payload: { alivePlayers } });
    UI.updateStatusMessage('正在進行暗投，等待玩家提交...');
});

// 接收投票
function handleVoteSubmit(peerId, payload) {
    const voter = playersData.find(p => p.peerId === peerId);
    if (!voter || voter.isDead) return;

    currentVotes[voter.seatNumber] = payload.target;
    
    const aliveCount = playersData.filter(p => !p.isDead).length;
    if (Object.keys(currentVotes).length >= aliveCount) {
        calculateVoteResults();
    }
}

// 計算得票與攔截
function calculateVoteResults() {
    broadcastToAll({ type: 'END_VOTE', payload: {} });
    
    let voteCounts = {};
    Object.values(currentVotes).forEach(target => {
        if (target !== 'abstain') {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        }
    });

    // 烏鴉詛咒加票判定
    if (gameState.crowTarget) {
        voteCounts[gameState.crowTarget] = (voteCounts[gameState.crowTarget] || 0) + 1;
        gameState.crowTarget = null; // 消耗狀態
    }

    let maxVotes = 0;
    let finalTarget = null;
    let isTie = false;

    for (const [target, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            finalTarget = parseInt(target);
            isTie = false;
        } else if (count === maxVotes) {
            isTie = true;
        }
    }

    const resultContainer = document.getElementById('vote-results-container');
    
    if (isTie || !finalTarget) {
        resultContainer.innerHTML = `<p>投票結果：平票或全數棄票，無人出局。</p>`;
    } else {
        const targetPlayer = playersData.find(p => p.seatNumber === finalTarget);
        
        // 白痴出局攔截
        if (targetPlayer && targetPlayer.role === "白痴") {
            resultContainer.innerHTML = `<p>投票結果：${finalTarget} 號最高票。觸發【白痴】技能，免除出局但喪失後續投票權。</p>`;
        } else {
            resultContainer.innerHTML = `<p>投票結果：${finalTarget} 號玩家被放逐出局。</p>`;
            targetPlayer.isDead = true;
            broadcastToAll({ type: 'DEATH_ANNOUNCEMENT', payload: { targetSeat: finalTarget } });
            UI.renderPlayerGrid('host-players-grid', playersData, true);
        }
    }
}

// 狼人陣營自爆中斷
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
    
    // 強制進入夜晚
    setTimeout(startNightPhase, 3000);
}

// 綁定 UI 事件
document.getElementById('btn-end-night')?.addEventListener('click', processDawnSettlement);
document.getElementById('btn-end-day')?.addEventListener('click', startNightPhase);
document.getElementById('btn-interrupt-skill')?.addEventListener('click', () => {
    // 供主持人手動觸發如騎士決鬥、定序王子作廢投票等全域中斷狀態
    if(confirm('是否要作廢本次投票或執行白天中斷技能？')) {
        currentVotes = {};
        document.getElementById('vote-results-container').innerHTML = '<p>主持人已作廢本次流程，請重新發言或進行階段。</p>';
    }
});