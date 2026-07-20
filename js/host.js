// ==========================================
// v4.0.6 網路通訊橋樑與 UI 同步器 (Network & Bridge)
// 檔案位置: js/host.js
// ==========================================

let hostPeer = null;
let connections = {};
let engineContext = null;
let stateMachine = null;

window.initHost = function(roomId) {
    document.getElementById('display-room-id').textContent = roomId;
    
    engineContext = new Engine.GameContext();
    stateMachine = new Engine.StateMachine(engineContext);
    
    PhaseRegistry.init(stateMachine, engineContext);
    
    Engine.EventBus.on('SYNC_STATE', syncStateToAll);
    Engine.EventBus.on('PHASE_CHANGED', syncStateToAll);
    Engine.EventBus.on('RESUME_ROUTINE', resumeRoutinePhase); 
    Engine.EventBus.on('BROADCAST_MESSAGE', msg => {
        let initialRolesLog = "【開局身分配置】\n";
        engineContext.players.forEach(p => p.data.tempPrivateMessage = msg);
        Engine.EventBus.emit('MASTER_LOG', `【系統廣播】${msg}`);
        syncStateToAll();
    });

    // [新增] 註冊全知紀錄事件接收器
    Engine.EventBus.on('MASTER_LOG', (msg) => {
        if (!engineContext.masterLog) engineContext.masterLog = [];
        const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
        engineContext.masterLog.push(`<span style="color:#888; font-size:10px;">[${time}]</span><br/>${msg}`);
        syncStateToAll();
    });

    engineContext.systemLog = '⏳ 正在與連線伺服器建立通道，請稍候...';
    syncStateToAll();

    // [嚴謹架構] 貫徹 Fail-Fast 原則並使用 ES6 模板字串。
    // 透過強制綁定 GAME_PREFIX，達成高內聚的網域隔離。
    const fullRoomId = `${GAME_PREFIX}${roomId}`;
    
    hostPeer = new Peer(fullRoomId, PEER_CONFIG);
    hostPeer.on('open', (id) => {
        engineContext.systemLog = '✅ 房間建立成功！請等待玩家加入...';
        syncStateToAll();
    });
    
    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        conn.on('data', (data) => handleIncomingPacket(conn.peer, data));
    });
    
    hostPeer.on('error', (err) => {
        engineContext.systemLog = '❌ 建立房間失敗，可能是網路不穩或房號衝突。';
        syncStateToAll();
        alert('建立房間失敗，請重新整理頁面再試一次。');
    });
    
    setupEngineFlowControllers();
    RoleRegistry.initPassives(engineContext);
};

function handleIncomingPacket(peerId, data) {
    if (engineContext.isResolvingAsync) return;
    if (data.type === PACKET_TYPE.JOIN_ROOM && engineContext.phase === 'LOBBY') {
        const p = engineContext.addPlayer(peerId, data.payload.name);
        try {
            connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber: p.seatNumber } });
        } catch(e) { console.warn('JOIN_SUCCESS Send Failed'); }
        engineContext.systemLog = `玩家 ${p.name} (${p.seatNumber}號) 已加入。`;
        syncStateToAll();
    }
    else if (data.type === PACKET_TYPE.ACTION_SUBMIT || data.type === PACKET_TYPE.VOTE_SUBMIT) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player) {
            // 讀取當前階段的邏輯設定
            const currentPhaseLogic = stateMachine.currentPhase;
            
            // 如果玩家已死，且當前階段沒有開放死者行動權限，則丟棄封包
            if (player.isDead && (!currentPhaseLogic || !currentPhaseLogic.allowDeadAction)) {
                return;
            }
            
            stateMachine.handleAction(player, data.payload.actionId, data.payload.targets);
        }
    }
    else if (data.type === PACKET_TYPE.SHERIFF_BAILOUT && ['SHERIFF_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT'].includes(engineContext.phase)) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && (engineContext.sheriff.candidates || []).includes(player.seatNumber)) {
            engineContext.sheriff.candidates = engineContext.sheriff.candidates.filter(s => s !== player.seatNumber);
            engineContext.sheriff.withdrawn.push(player.seatNumber);
            engineContext.systemLog = `宣布${player.seatNumber} 號玩家退水`;
            syncStateToAll();
        }
    }
    else if (data.type === PACKET_TYPE.WOLF_EXPLODE) {
        const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
        
        if (sheriffPhases.includes(engineContext.phase)) {
            // [關鍵修復] 呼叫正規的死亡過濾器，確保解藥與守衛等狀態能正確抵銷狼刀
            const calculation = {
                killed: [...engineContext.nightTags.killed],
                poisoned: [...engineContext.nightTags.poisoned],
                saved: engineContext.witchState?.savedSeat ? [engineContext.witchState.savedSeat] : [],
                guarded: engineContext.guardedSeat ? [engineContext.guardedSeat] : [],
                dreamed: engineContext.dreamedSeat ? [engineContext.dreamedSeat] : [],
                lastDreamed: engineContext.lastDreamedSeat ? [engineContext.lastDreamedSeat] : []
            };
            const deathMap = engineContext.applyFilter('DAWN_DEATH_EVALUATION', calculation);
            
            engineContext.players.forEach(p => {
                if (!p.isDead && deathMap[p.seatNumber]) {
                    p.kill(deathMap[p.seatNumber], engineContext);
                }
            });
            
            engineContext.nightTags.killed = [];
            engineContext.nightTags.poisoned = [];
            engineContext.guardedSeat = null;
            engineContext.sheriff.explodeDelayCount++;
            const maxExplode = engineContext.rules.sheriffExplodeRule === 'double' ? 2 : 1;
            if (engineContext.sheriff.explodeDelayCount >= maxExplode) {
                engineContext.sheriff.badgeLost = true;
            } else {
                engineContext.sheriff.isDelayedElection = true;
            }
        }
        Engine.EventBus.emit('MASTER_LOG', `【突發事件】${player.seatNumber}號 狼人自爆！`);
        Engine.EventBus.emit('WOLF_EXPLODE', { context: engineContext, player: engineContext.getPlayerByPeer(peerId) });
    }
    else if (data.type === PACKET_TYPE.WOLF_PREVIEW) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && player.role && RoleRegistry.plugins[player.role]?.canSeeWolves && engineContext.phase === 'NIGHT_ACTION') {
            engineContext.wolfPreviews[peerId] = { seat: player.seatNumber, target: data.payload.target };
            syncStateToAll();
        }
    }
    else if (data.type === 'WOLF_CHAT_SEND') {
        const player = engineContext.getPlayerByPeer(peerId);
        const plugin = RoleRegistry.plugins[player?.role];
        const currentStep = engineContext.nightSequence?.[engineContext.currentNightStepIndex];   
        const hasWolfChat = plugin?.hasWolfChatAccess === true || (typeof plugin?.hasWolfChatAccess === 'function' && plugin.hasWolfChatAccess(engineContext, player));
        if (player && !player.isDead && hasWolfChat && currentStep?.phaseId === 'midnight') {
            const msgText = data.payload.text?.trim();
            if (msgText) {
                engineContext.wolfChatHistory = engineContext.wolfChatHistory || [];
                engineContext.wolfChatHistory.push({
                    seatNumber: player.seatNumber,
                    text: msgText,
                    timestamp: Date.now()
                });
                syncStateToAll(); // 廣播使介面即時更新
            }
        }
    }    
    else if (data.type === 'DAY_SKILL_SUBMIT') { // 注意：前端發送封包時 type 需對應
        const player = engineContext.getPlayerByPeer(peerId);
        const plugin = RoleRegistry.plugins[player?.role];
        
        // 防呆：玩家活著 + 擁有該技能 + 技能ID吻合
        if (player && !player.isDead && plugin?.daySkill && plugin.daySkill.id === data.payload.skillId) {
            if (!plugin.daySkill.allowedPhases.includes(engineContext.phase)) return;
            const validTargets = plugin.daySkill.getSelectableSeats(engineContext, player.seatNumber);
            if (!validTargets.includes(data.payload.target)) return;
            plugin.daySkill.resolve(engineContext, player, data.payload.target);
            Engine.EventBus.emit('MASTER_LOG', `【技能發動】${player.seatNumber}號(${player.role}) 對 ${data.payload.target}號 使用了 ${plugin.daySkill.buttonText}`);
            syncStateToAll();
        }
    }
}

window.startGame = function(selectedRoles, boardName, rules) {
    if (selectedRoles.length !== engineContext.players.length) return alert('角色數量與玩家人數不符！');
    
    let shuffled = [...selectedRoles].sort(() => Math.random() - 0.5);
    engineContext.players.forEach((p, idx) => p.role = shuffled[idx]);
    
    engineContext.boardName = boardName;
    engineContext.rules = rules;
    engineContext.sheriff.enabled = (rules.sheriff === 'enabled'); 
    
    engineContext.systemLog = '發牌完成，準備進入第一天夜晚...';
    stateMachine.transitionTo('NIGHT_TRANSITION');
    setTimeout(() => Engine.EventBus.emit('START_NIGHT'), 5000);
    return true; 
};

function setupEngineFlowControllers() {
    Engine.EventBus.on('START_NIGHT', () => {
        engineContext.nightCount++;
        engineContext.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
        engineContext.wolfPreviews = {};
        engineContext.wolfChatHistory = [];
        engineContext.cursedSeat = null;
        engineContext.lastFearedSeat = engineContext.fearedSeat || null;
        engineContext.fearedSeat = null;
        engineContext.lastCharmedSeat = engineContext.charmedSeat || null;
        engineContext.charmedSeat = null;
        engineContext.lastDreamedSeat = engineContext.dreamedSeat || null;
        engineContext.dreamedSeat = null;
        engineContext.players.forEach(p => p.data.latestCheckResult = null);
        
        const alive = engineContext.getAlivePlayers();
        let phases = { 'first_half': [], 'midnight': [], 'second_half': [] };
        alive.forEach(p => {
            const def = RoleRegistry.plugins[p.role];
            if (def && def.nightPhase) {
                const phaseArray = Array.isArray(def.nightPhase) ? def.nightPhase : [def.nightPhase];
                phaseArray.forEach(phaseName => {
                    if (phases[phaseName]) {
                        let r = phases[phaseName].find(x => x.roleName === p.role);
                        if (!r) phases[phaseName].push({ roleName: p.role, roleDef: def, activePlayers: [p], resultLog: "" });
                        else r.activePlayers.push(p);
                    }
                });
            }
        });
        
        engineContext.nightSequence = [];
        if (phases['first_half'].length > 0) engineContext.nightSequence.push({ phaseId: 'first_half', phaseName: '前半夜', roles: phases['first_half'] });
        if (phases['midnight'].length > 0) engineContext.nightSequence.push({ phaseId: 'midnight', phaseName: '午夜 (狼人)', roles: phases['midnight'] });
        if (phases['second_half'].length > 0) engineContext.nightSequence.push({ phaseId: 'second_half', phaseName: '後半夜', roles: phases['second_half'] });
        
        engineContext.currentNightStepIndex = -1;
        Engine.EventBus.emit('NIGHT_STEP_COMPLETE');
    });

    Engine.EventBus.on('NIGHT_STEP_COMPLETE', () => {
        engineContext.currentNightStepIndex++;
        if (engineContext.currentNightStepIndex >= engineContext.nightSequence.length) {
            Engine.EventBus.emit('PROCESS_DAWN');
        } else {
            // [乾淨架構] 寫入環境變數，由 DTO 傳遞動態時長 (毫秒)
            const currentStep = engineContext.nightSequence[engineContext.currentNightStepIndex];
            engineContext.dynamicNightDuration = (currentStep.phaseId === 'midnight') ? 45000 : 20000;
            
            stateMachine.transitionTo('NIGHT_ACTION');
        }
    });

    Engine.EventBus.on('PROCESS_DAWN', () => {
        if (engineContext.rules.sheriff === 'enabled' && !engineContext.sheriff.seat && !engineContext.sheriff.badgeLost) {
            if (!engineContext.sheriff.isDelayedElection) {
                stateMachine.transitionTo('SHERIFF_CANDIDACY');
            } else {
                stateMachine.transitionTo('SHERIFF_RE_ELECTION_BAILOUT');
            }
        } else {
            Engine.EventBus.emit('DAWN_ANNOUNCE');
        }
    });

    Engine.EventBus.on('DAWN_ANNOUNCE', () => {
        const deadBefore = engineContext.players.filter(p => p.isDead).map(p => p.seatNumber);
        engineContext.hunterDiedThisNight = false;
        const calculation = {
            killed: [...engineContext.nightTags.killed],
            poisoned: [...engineContext.nightTags.poisoned],
            saved: engineContext.witchState?.savedSeat ? [engineContext.witchState.savedSeat] : [],
            guarded: engineContext.guardedSeat ? [engineContext.guardedSeat] : [],
            dreamed: engineContext.dreamedSeat ? [engineContext.dreamedSeat] : [],
            lastDreamed: engineContext.lastDreamedSeat ? [engineContext.lastDreamedSeat] : []
        };

        const deathMap = engineContext.applyFilter('DAWN_DEATH_EVALUATION', calculation);
        
        // [乾淨架構 2] 觸發死亡：若發生殉情，連鎖事件會在此迴圈執行期間同步改變目標狀態
        engineContext.players.forEach(p => {
            if (!p.isDead && deathMap[p.seatNumber]) {
                p.kill(deathMap[p.seatNumber], engineContext);
            }
        });

        // [乾淨架構 3] 狀態比對：自動收集本次結算中所有轉為死亡的玩家（精準涵蓋被刀、被毒、殉情等所有死因）
        engineContext.deadThisNight = engineContext.players
            .filter(p => p.isDead && !deadBefore.includes(p.seatNumber))
            .map(p => p.seatNumber);

        engineContext.nightTags.killed = [];
        engineContext.nightTags.poisoned = [];
        engineContext.guardedSeat = null; 

        Engine.EventBus.emit('CHECK_WIN_CONDITION', engineContext);
        if (engineContext.phase === 'GAME_OVER') return;

        const dead = engineContext.deadThisNight;
        engineContext.lastWordsTargets = (engineContext.nightCount === 1 && dead.length > 0) ? [...dead] : [];
        const msg = dead.length > 0 ? `昨晚，${dead.join(' 號、')} 號玩家死亡。` : `昨晚是平安夜。`;
        engineContext.systemLog = msg;
        Engine.EventBus.emit('BROADCAST_MESSAGE', msg);
        
        // ===============================================
        // [新增] 白天發言順序與動態文本計算
        // ===============================================
        const deadPrompt = dead.length === 0 ? "昨晚是平安夜" : `昨晚 ${[...dead].sort((a, b) => a - b).join(' 號、')} 號玩家死亡`;
        engineContext.systemLog = deadPrompt;
        
        if (engineContext.sheriff.seat && !engineContext.sheriff.badgeLost) {
            // 有警長：流轉至警長決定順序階段
            engineContext.dayDiscussionPrompt = `${deadPrompt}\n請警長決定發言順序`;
            engineContext.destinationPhase = 'SHERIFF_ORDER_SELECTION';
        } else {
            // 無警長：系統隨機決定起點與順逆，並直接建構佇列
            let startSeat;
            const dirNum = Math.random() < 0.5 ? 1 : -1;
            const dirStr = dirNum === 1 ? '順' : '逆';
            
            if (dead.length === 0) {
                // 狀況 A：無人死亡 -> 隨機存活者，隨機順逆
                const aliveSeats = engineContext.getAlivePlayers().map(p => p.seatNumber);
                startSeat = aliveSeats[Math.floor(Math.random() * aliveSeats.length)];
            } else {
                // 狀況 B：有人死亡 -> 隨機一名死者，依據順逆序尋找其存活之下家或上家
                const randomDeadSeat = dead[Math.floor(Math.random() * dead.length)];
                startSeat = engineContext.getNextAliveSeat(randomDeadSeat, dirNum);
            }
            
            // 將計算結果寫入 UI 文本，供全體玩家查看
            engineContext.dayDiscussionPrompt = `${deadPrompt}\n請從 ${startSeat} 號開始${dirStr}序發言`;
            engineContext.buildSpeakingQueue(startSeat, dirNum);
            engineContext.destinationPhase = 'DAY_DISCUSSION';
        }
        // ===============================================

        engineContext.isPK = false;
        
        engineContext.routineOrigin = 'MORNING'; 
        resumeRoutinePhase();
    });

    Engine.EventBus.on('FORCE_ENTER_NIGHT', () => {
        stateMachine.transitionTo('NIGHT_TRANSITION'); 
        setTimeout(() => Engine.EventBus.emit('START_NIGHT'), 1000); 
    });
    
    Engine.EventBus.on('CHECK_WIN_CONDITION', (ctx) => {
        if (ctx.phase === 'GAME_OVER') return;
        const alive = ctx.getAlivePlayers();
        const wolfCount = alive.filter(p => p.role && ROLE_DICTIONARY[p.role]?.faction === 'wolf').length;
        const godCount = alive.filter(p => p.role && ROLE_DICTIONARY[p.role]?.type === 'god').length;
        const vilCount = alive.filter(p => p.role && ROLE_DICTIONARY[p.role]?.type === 'villager').length;
        let winner = null, reason = "";
        if (ctx.rules.winCondition === 'kill_all' && godCount + vilCount === 0) { winner = "狼人"; reason = "好人陣營全數出局"; }
        else if (ctx.rules.winCondition === 'kill_side' && (godCount === 0 || vilCount === 0)) { winner = "狼人"; reason = godCount===0?"神職全滅":"平民全滅"; }
        else if (wolfCount === 0) { winner = "好人"; reason = "狼人全數出局"; }

        if (winner) {
            stateMachine.clearTimer();
            ctx.systemLog = `遊戲結束，${winner}陣營勝利！\n(${reason})`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            stateMachine.transitionTo('GAME_OVER');
        }
    });
}

function resumeRoutinePhase() {
    // [擴充] 支援因為特殊掛鉤 (mustTransferBadge) 而必須移交警徽的存活玩家
    const sheriffToTransfer = engineContext.players.find(p => (p.isDead || p.data.mustTransferBadge) && p.seatNumber === engineContext.sheriff.seat);
    if (sheriffToTransfer && !engineContext.sheriff.badgeLost) {
        stateMachine.transitionTo('SHERIFF_TRANSFER');
    } else if (engineContext.pendingHunter) {
        engineContext.activeShooter = engineContext.pendingHunter; // [新增] 鎖定開槍者座位
        engineContext.pendingHunter = null;
        stateMachine.transitionTo('HUNTER_ACTION');
    } else if (engineContext.pendingWolfKing) {
        engineContext.activeShooter = engineContext.pendingWolfKing; // [新增] 鎖定開槍者座位
        engineContext.pendingWolfKing = null;
        stateMachine.transitionTo('WOLFKING_ACTION');
    } else if (engineContext.lastWordsTargets && engineContext.lastWordsTargets.length > 0) {
        stateMachine.transitionTo('LAST_WORDS');
    } else {
        engineContext.lastWordsTargets = [];
        
        const destPhase = engineContext.destinationPhase;
        stateMachine.transitionTo(destPhase);
        
        if (destPhase === 'NIGHT_TRANSITION') {
            setTimeout(() => Engine.EventBus.emit('START_NIGHT'), 4000);
        }
    }
}

function syncStateToAll() {
    const ctx = engineContext;
    const isDayPhase = ['DAWN_SETTLEMENT', 'SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_TRANSFER', 'SHERIFF_ORDER_SELECTION', 'DAY_DISCUSSION', 'DAY_VOTING', 'DAY_PK_SPEECH', 'DAY_PK_VOTING', 'VOTE_RESULT_DISPLAY', 'LAST_WORDS', 'GAME_OVER', 'WOLFKING_ACTION'].includes(ctx.phase);

    const hostState = {
        systemLog: ctx.systemLog,
        masterLog: ctx.masterLog || [],
        players: ctx.players.map(p => ({ ...p })),
        layout: { showSetupPanel: ctx.phase === 'LOBBY', showNightPanel: ['NIGHT_TRANSITION', 'NIGHT_ACTION'].includes(ctx.phase), showDayPanel: isDayPhase },
        nightFlow: (ctx.nightSequence || []).map((step, idx) => ({ title: `[${step.phaseName}]`, status: idx < ctx.currentNightStepIndex ? 'completed' : (idx === ctx.currentNightStepIndex ? 'active' : 'pending'), result: step.roles.map(r => r.roleName).join(', ') })),
        allowForceNext: ctx.phase === 'NIGHT_ACTION',
        dayBtnText: getDayBtnText(ctx.phase),
        dayBtnDisabled: ['SHERIFF_CANDIDACY', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_TRANSFER', 'DAY_VOTING', 'DAY_PK_VOTING', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'GAME_OVER'].includes(ctx.phase),        
        dayBtnCommand: getDayBtnCommand(ctx.phase)
    };
    UI.renderHostView(hostState, handleHostCommand);
    ctx.players.forEach(player => {
        if (connections[player.peerId]) {
            try { connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: buildUIStateForPlayer(ctx, player, isDayPhase) }); } 
            catch (e) {}
        }
    });
}

function buildUIStateForPlayer(ctx, player, isDayPhase) {
    const isSheriffPhase = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING'].includes(ctx.phase);

    // ==========================================
    // 1. 處理每個玩家座位上的標籤與狀態
    // ==========================================
    const mappedPlayers = ctx.players.map(p => {
        let topTag = null, sideTag = null, wolfPreviewTags = [];
        if (ctx.phase === 'GAME_OVER' || p.isRevealed || (p.isDead && ctx.rules.deathReveal === 'light')) topTag = p.role;
        else if (RoleRegistry.plugins[player.role]?.canSeeWolves && RoleRegistry.plugins[p.role]?.seenAsWolf) topTag = p.role;
        else if (player.data.customTopTags && player.data.customTopTags[p.seatNumber]) topTag = player.data.customTopTags[p.seatNumber];
        if (player.data.seerRecords && player.data.seerRecords[p.seatNumber]) sideTag = player.data.seerRecords[p.seatNumber]; 
        else if (player.role === '女巫' && ctx.witchState?.silverWater === p.seatNumber) sideTag = "銀水"; 
        else if (player.role === '暗戀者' && ctx.crushTarget === p.seatNumber) sideTag = "暗戀對象";

        if (ctx.phase === 'NIGHT_ACTION' && RoleRegistry.plugins[player.role]?.canSeeWolves) {
            Object.values(ctx.wolfPreviews || {}).forEach(preview => {
                if (String(preview.target) === String(p.seatNumber) && preview.seat !== player.seatNumber) wolfPreviewTags.push(`${preview.seat}號`);
            });
        }
        
        let isPKTgt = false;
        if (['SHERIFF_PK_SPEECH', 'SHERIFF_PK_VOTING'].includes(ctx.phase)) isPKTgt = (ctx.sheriff.pkTargets || []).includes(p.seatNumber);
        if (['DAY_PK_SPEECH', 'DAY_PK_VOTING'].includes(ctx.phase)) isPKTgt = (ctx.pkTargets || []).includes(p.seatNumber);

        return { 
            seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, deathReason: p.deathReason,
            topTag, sideTag, wolfPreviewTags, isWolfSelected: wolfPreviewTags.length > 0,
            isCandidate: isSheriffPhase && (ctx.sheriff.candidates || []).includes(p.seatNumber), 
            hasWithdrawn: isSheriffPhase && (ctx.sheriff.withdrawn || []).includes(p.seatNumber),
            isSheriff: (ctx.sheriff.seat === p.seatNumber),
            isPKTarget: isPKTgt
        };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer(ctx.phase, ctx);

    // ==========================================
    // 2. 處理玩家本人的行動面板 (Action Panel)
    // ==========================================
    if (ctx.phase === 'NIGHT_ACTION' && !player.isDead) {
        const currentPhase = ctx.nightSequence[ctx.currentNightStepIndex];
        let myRoleInPhase = currentPhase ? currentPhase.roles.find(r => r.activePlayers.some(ap => ap.seatNumber === player.seatNumber)) : null;
        const hasActed = ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (myRoleInPhase) {
            const plugin = RoleRegistry.plugins[myRoleInPhase.roleName];
            let canAct = plugin.hasAction ? plugin.hasAction(ctx, player.seatNumber) : true;
            canAct = ctx.applyFilter('NIGHT_ACTION_PERMISSION', canAct, { context: ctx, player });
            
            if (canAct) {
                actionPanel.show = true;
                actionPanel.deadline = ctx.deadline;
                
                actionPanel.type = typeof plugin.actionType === 'function' ? plugin.actionType(ctx) : plugin.actionType;
                const isAttacker = typeof plugin.isAttacker === 'function' ? plugin.isAttacker(ctx) : plugin.isAttacker;

                actionPanel.selectableSeats = plugin.getSelectableSeats(ctx, player.seatNumber);
                actionPanel.buttons = plugin.getButtons(ctx, player.seatNumber);
                actionPanel.passTags = plugin.getPassTags ? plugin.getPassTags(ctx, player.seatNumber) : [];
                
                if (isAttacker) {
                    const myPreview = ctx.wolfPreviews[player.peerId];
                    if (myPreview && myPreview.target !== 'pass') actionPanel.preSelectedTarget = parseInt(myPreview.target);
                } else {
                    actionPanel.preSelectedTarget = plugin.getPreSelectedTarget ? plugin.getPreSelectedTarget(ctx) : null; 
                }

                if (hasActed) {
                    actionPanel.prompt = isAttacker ? "等待隊友決定。" : "行動已送出。";
                    actionPanel.buttons = []; actionPanel.deadline = null;
                } else {
                    actionPanel.prompt = plugin.getPrompt(ctx, player.seatNumber);
                }
            }
        }
    } 
    else if (ctx.phase === 'SHERIFF_CANDIDACY' && !player.isDead) {
        actionPanel.show = true; actionPanel.deadline = ctx.deadline;
        if (ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber)) {
            actionPanel.prompt = "已登記，等待..."; actionPanel.buttons = []; actionPanel.deadline = null;
        } else {
            actionPanel.prompt = "是否參與【警長競選】？";
            actionPanel.buttons = [{ id: 'run', text: '競選', requiresTarget: false }, { id: 'pass', text: '不競選', requiresTarget: false }];
        }
    }
    if (['SHERIFF_VOTING', 'SHERIFF_PK_VOTING'].includes(ctx.phase) && !player.isDead) {
        actionPanel.show = true;
        const isEligible = !(ctx.sheriff.candidates || []).includes(player.seatNumber) && !(ctx.sheriff.withdrawn || []).includes(player.seatNumber);
        
        // [UI 狀態同步修復 1] 剝奪投票權的玩家，直接隱藏投票面板，避免送出幽靈封包
        if (player.data && player.data.cannotVote) { 
            actionPanel.prompt = "你已失去投票權。"; actionPanel.buttons = []; 
        }
        else if (!isEligible) { actionPanel.prompt = "你是警上玩家（或已退水），無法參與警長投票。"; actionPanel.buttons = []; }
        else if (ctx.votes[player.seatNumber] !== undefined) { actionPanel.prompt = "投票完成，等待..."; actionPanel.buttons = []; }
        else {
            actionPanel.type = 'single_select'; actionPanel.deadline = ctx.deadline; 
            actionPanel.selectableSeats = ctx.phase === 'SHERIFF_PK_VOTING' ? ctx.sheriff.pkTargets : (ctx.sheriff.candidates || []);
            actionPanel.prompt = '選擇你要投票的警長候選人：';
            actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
            actionPanel.buttons = [{ id: 'vote', text: '投票', requiresTarget: true }, { id: 'pass', text: '棄票', requiresTarget: false }];
        }
    }
    else if (['DAY_VOTING', 'DAY_PK_VOTING'].includes(ctx.phase) && !player.isDead) {
        actionPanel.show = true;
        const isDayPK = ctx.phase === 'DAY_PK_VOTING';
        
        // [UI 狀態同步修復 2] 隱藏失去投票權者的介面
        if (player.data && player.data.cannotVote) { 
            actionPanel.prompt = "你已失去投票權。"; actionPanel.buttons = []; 
        }
        else if (isDayPK && (ctx.pkTargets || []).includes(player.seatNumber)) { actionPanel.prompt = "你是 PK 發言對象，無法投票。"; actionPanel.buttons = []; }
        else if (ctx.votes[player.seatNumber] !== undefined) { actionPanel.prompt = "投票完成，等待..."; actionPanel.buttons = []; }
        else {
            actionPanel.type = 'single_select'; actionPanel.deadline = ctx.deadline; 
            // [規則防護修復] 於前端過濾掉 cannotVote 狀態者（如翻牌白痴），禁止其他玩家將其選為放逐目標
            actionPanel.selectableSeats = isDayPK ? ctx.pkTargets : ctx.getAlivePlayers().filter(p => !p.data.cannotVote).map(p=>p.seatNumber);
            actionPanel.prompt = isDayPK ? '選擇 PK 目標：' : '選擇放逐目標：';
            if (ctx.sheriff.seat === player.seatNumber) actionPanel.prompt += '\n(你是警長，擁有 1.5 票)';
            actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
            actionPanel.buttons = [{ id: 'vote', text: '投票', requiresTarget: true }, { id: 'pass', text: '棄票', requiresTarget: false }];
        }
    }
    else if (ctx.phase === 'SHERIFF_TRANSFER' && player.seatNumber === ctx.sheriff.seat) {
        actionPanel.show = true; actionPanel.type = 'single_select'; 
        actionPanel.selectableSeats = ctx.getAlivePlayers().filter(p => !p.data.cannotVote).map(p=>p.seatNumber);
        actionPanel.prompt = player.isDead ? '你已死亡。選擇移交警徽，或撕毀：' : '請選擇移交警徽，或撕毀：';
        actionPanel.buttons = [{ id: 'transfer', text: '移交警徽', requiresTarget: true }, { id: 'pass', text: '撕毀警徽', requiresTarget: false }];
    }
    else if (ctx.phase === 'VOTE_RESULT_DISPLAY') {
        actionPanel.show = true; actionPanel.prompt = ctx.currentVoteResultString;
    }
    else if (ctx.phase === 'SHERIFF_ORDER_SELECTION') {
        actionPanel.show = true; actionPanel.deadline = ctx.deadline;
        if (player.seatNumber === ctx.sheriff.seat) {
            actionPanel.prompt = "請決定白天發言順序：";
            actionPanel.buttons = [
                { id: 'order_left', text: '逆序發言', requiresTarget: false },
                { id: 'order_right', text: '順序發言', requiresTarget: false }
            ];
        } else {
            actionPanel.prompt = "等待警長決定發言順序...";
            actionPanel.buttons = [];
        }
    }
    else if (['DAY_DISCUSSION', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'DAY_PK_SPEECH', 'LAST_WORDS'].includes(ctx.phase)) {
        actionPanel.show = true; actionPanel.deadline = ctx.deadline;
        
        if (player.seatNumber === ctx.currentSpeaker) {
            actionPanel.prompt = `現在是你的發言時間\n(發言完畢請主動結束)`;
            actionPanel.buttons = [{ id: 'end_speech', text: '結束發言', requiresTarget: false }];
        } else {
            const speakerStr = ctx.currentSpeaker ? `${ctx.currentSpeaker} 號` : "系統計算中";
            actionPanel.prompt = `現在由 ${speakerStr} 玩家發言...`;
            actionPanel.buttons = [];
        }
    }
    else if (ctx.phase === 'HUNTER_ACTION' || ctx.phase === 'WOLFKING_ACTION') {
        actionPanel.show = true;
        if (player.seatNumber === ctx.activeShooter) {
            actionPanel.type = 'single_select'; actionPanel.selectableSeats = ctx.getAlivePlayers().map(p=>p.seatNumber);
            actionPanel.prompt = `你已死亡，選擇開槍目標：`;
            actionPanel.buttons = [{ id: 'shoot', text: '開槍', requiresTarget: true }, { id: 'pass', text: '不開槍', requiresTarget: false }];
        } else {
            actionPanel.prompt = "系統結算中，請等待...";
        }
    }

    if (player.data.tempPrivateMessage) {
        personalMessage += "\n" + player.data.tempPrivateMessage;
        player.data.tempPrivateMessage = null; 
    }

    // ==========================================
    // 3. 打包回傳封包給前端渲染
    // ==========================================
    const roleCounts = {};
    ctx.players.forEach(p => { 
        if (p.role) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1; 
    });
    const deckArr = Object.entries(roleCounts).map(([r, c]) => `${r} x${c}`);
    const currentStep = ctx.nightSequence?.[ctx.currentNightStepIndex];
    const isMidnight = (currentStep?.phaseId === 'midnight');
    const plugin = RoleRegistry.plugins[player.role];
    const hasWolfChat = plugin?.hasWolfChatAccess === true || (typeof plugin?.hasWolfChatAccess === 'function' && plugin.hasWolfChatAccess(ctx, player));
    const canUseWolfChat = !player.isDead && ctx.phase === 'NIGHT_ACTION' && hasWolfChat;
    return {
        boardName: ctx.boardName, phase: ctx.phase, 
        nightStepIndex: ctx.currentNightStepIndex,
        mySeat: player.seatNumber, myRole: player.role,
        message: personalMessage, players: mappedPlayers, actionPanel, latestCheckResult: player.data.latestCheckResult || null,
        voteHistory: ctx.voteHistory, 
        allowSelfExplode: !player.isDead && isDayPhase && RoleRegistry.plugins[player.role]?.canSelfExplode,
        canUseWolfChat: canUseWolfChat,
        isMidnight: isMidnight,
        wolfChatHistory: canUseWolfChat ? (ctx.wolfChatHistory || []) : [],
        daySkill: (!player.isDead && isDayPhase && RoleRegistry.plugins[player.role]?.daySkill) ? {
            id: RoleRegistry.plugins[player.role].daySkill.id,
            buttonText: RoleRegistry.plugins[player.role].daySkill.buttonText,
            requiresTarget: RoleRegistry.plugins[player.role].daySkill.requiresTarget,
            selectableSeats: RoleRegistry.plugins[player.role].daySkill.getSelectableSeats(ctx, player.seatNumber)
        } : null,
        allowBailout: !player.isDead && ['SHERIFF_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT'].includes(ctx.phase) && (ctx.sheriff.candidates || []).includes(player.seatNumber)
    };
}

function getPhaseMessageForPlayer(phase, ctx) {
    const dict = { 
        'NIGHT_TRANSITION': "天黑請閉眼...", 'NIGHT_ACTION': "夜間行動中...", 
        'SHERIFF_CANDIDACY': "登記上警意願...", 
        'SHERIFF_ORDER_SELECTION': "決定發言順序中...",
        'SHERIFF_SPEECH': ctx ? (ctx.sheriffSpeechPrompt || "警長發言中...") : "警長發言中...", 
        'SHERIFF_RE_ELECTION_BAILOUT': "延遲選舉退水時間...", 
        'SHERIFF_PK_SPEECH': "警長 PK 發言...", 'SHERIFF_VOTING': "警長首次投票...", 'SHERIFF_PK_VOTING': "警長 PK 投票...", 
        'SHERIFF_TRANSFER': "移交警徽中...", 'DAY_DISCUSSION': ctx ? (ctx.dayDiscussionPrompt || "白天發言階段。") : "白天發言階段。",
        'DAY_VOTING': "放逐投票...", 'DAY_PK_SPEECH': "放逐 PK 發言...", 'DAY_PK_VOTING': "放逐 PK 投票...", 
        'VOTE_RESULT_DISPLAY': "展示投票結果...", 'LAST_WORDS': "遺言發表。", 'HUNTER_ACTION': "系統結算中...", 
        'WOLFKING_ACTION': "系統結算中...", 'GAME_OVER': engineContext ? engineContext.systemLog : "遊戲結束。"
    };
    return dict[phase] || "等待中...";
}

function getDayBtnText(phase) {
    const dict = { 'SHERIFF_CANDIDACY': "強制結束上警登記", 'SHERIFF_VOTING': "強制結算投票", 'SHERIFF_PK_VOTING': "強制結算投票", 'SHERIFF_SPEECH': "發起警長投票", 'SHERIFF_PK_SPEECH': "發起警長 PK 投票", 'DAY_DISCUSSION': "發起放逐投票", 'DAY_PK_SPEECH': "發起放逐 PK 投票", 'VOTE_RESULT_DISPLAY': "結束展示，進入下一階段", 'LAST_WORDS': "結束遺言，進入下一階段", 'SHERIFF_TRANSFER': "等待警長移交...", 'HUNTER_ACTION': "等待獵人開槍...", 'WOLFKING_ACTION': "等待狼王開槍..." };
    return dict[phase] || "投票/行動進行中...";
}

function getDayBtnCommand(phase) {
    const dict = { 'SHERIFF_CANDIDACY': "FORCE_TIMEOUT", 'SHERIFF_VOTING': "FORCE_TIMEOUT", 'SHERIFF_PK_VOTING': "FORCE_TIMEOUT", 'SHERIFF_SPEECH': "START_SHERIFF_VOTE", 'SHERIFF_PK_SPEECH': "START_SHERIFF_PK_VOTE", 'DAY_DISCUSSION': "START_VOTE", 'DAY_PK_SPEECH': "START_DAY_PK_VOTE", 'VOTE_RESULT_DISPLAY': "END_VOTE_DISPLAY", 'LAST_WORDS': "END_LAST_WORDS" };
    return dict[phase] || "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT' || cmd === 'FORCE_TIMEOUT') {
        stateMachine.clearTimer();
        if (stateMachine.currentPhase && stateMachine.currentPhase.onTimeout) stateMachine.currentPhase.onTimeout(engineContext);
    } 
    else if (cmd === 'START_SHERIFF_VOTE') stateMachine.transitionTo('SHERIFF_VOTING');
    else if (cmd === 'START_SHERIFF_PK_VOTE') stateMachine.transitionTo('SHERIFF_PK_VOTING'); // 新增
    else if (cmd === 'START_VOTE') { engineContext.routineOrigin = 'AFTERNOON'; stateMachine.transitionTo('DAY_VOTING'); }
    else if (cmd === 'START_DAY_PK_VOTE') { engineContext.routineOrigin = 'AFTERNOON'; stateMachine.transitionTo('DAY_PK_VOTING'); } // 修改
    else if (cmd === 'END_VOTE_DISPLAY') {
        if (engineContext.nextPhaseAfterVoteDisplay === 'DAWN_RESUME') Engine.EventBus.emit('DAWN_ANNOUNCE');
        else if (engineContext.nextPhaseAfterVoteDisplay === 'RESUME_ROUTINE') resumeRoutinePhase();
        else if (engineContext.nextPhaseAfterVoteDisplay) stateMachine.transitionTo(engineContext.nextPhaseAfterVoteDisplay);
    }
    else if (cmd === 'END_LAST_WORDS') { engineContext.lastWordsTargets = []; resumeRoutinePhase(); }
}
