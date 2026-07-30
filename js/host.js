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

    // [新增] 啟動應用層心跳廣播
    setInterval(() => {
        Object.values(connections).forEach(conn => {
            if (conn.open) {
                try { conn.send({ type: PACKET_TYPE.PING }); } catch (e) {}
            }
        });
    }, NETWORK_CONFIG.PING_INTERVAL);
};

function handleIncomingPacket(peerId, data) {
    // [新增] 攔截客戶端回應的心跳，不干涉後續遊戲邏輯
    if (data.type === PACKET_TYPE.PONG) return; 

    if (engineContext.isResolvingAsync) return;
    
    // [修復] 解耦 JOIN_ROOM 邏輯，區分「大廳新加入」與「遊戲中斷線重連」
    if (data.type === PACKET_TYPE.JOIN_ROOM) {
        const playerName = data.payload.name;
        
        if (engineContext.phase === 'LOBBY') {
            const p = engineContext.addPlayer(peerId, playerName);
            try {
                connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber: p.seatNumber } });
            } catch(e) { console.warn('JOIN_SUCCESS Send Failed'); }
            engineContext.systemLog = `玩家 ${p.name} (${p.seatNumber}號) 已加入。`;
            syncStateToAll();
        } else {
            // [重連閘門] 若非大廳階段，嚴格比對已存在的暱稱，若吻合則進行 peerId 替換並恢復連線
            const existingPlayer = engineContext.players.find(p => p.name === playerName);
            if (existingPlayer) {
                existingPlayer.peerId = peerId;
                try { connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber: existingPlayer.seatNumber } }); } catch (e) {}
                syncStateToAll(); 
            }
        }
    }
    else if (data.type === PACKET_TYPE.ACTION_SUBMIT || data.type === PACKET_TYPE.VOTE_SUBMIT) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player) {
            const currentPhaseLogic = stateMachine.currentPhase;
            if (player.isDead && (!currentPhaseLogic || !currentPhaseLogic.allowDeadAction)) {
                return;
            }
            
            stateMachine.handleAction(player, data.payload.actionId, data.payload.targets);
            syncStateToAll();
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
        const player = engineContext.getPlayerByPeer(peerId);
        if (!player) return;
        const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
        if (sheriffPhases.includes(engineContext.phase)) {
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
    else if (data.type === 'DAY_SKILL_SUBMIT') {
        const player = engineContext.getPlayerByPeer(peerId);
        const plugin = RoleRegistry.plugins[player?.role];
        if (player && plugin?.daySkill && plugin.daySkill.id === data.payload.skillId) {
            if (player.isDead && !plugin.daySkill.allowDead) return;
            if (!plugin.daySkill.allowedPhases.includes(engineContext.phase)) return;
            
            if (plugin.daySkill.requiresTarget) {
                const validTargets = plugin.daySkill.getSelectableSeats(engineContext, player.seatNumber);
                if (!validTargets.includes(data.payload.target)) return;
            }
            plugin.daySkill.resolve(engineContext, player, data.payload.target);
            const targetText = plugin.daySkill.requiresTarget ? ` 對 ${data.payload.target}號` : "";
            Engine.EventBus.emit('MASTER_LOG', `【技能發動】${player.seatNumber}號(${player.role})${targetText} 使用了 ${plugin.daySkill.buttonText}`);
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
        engineContext.dailyVotes = {};
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
        const previousStep = engineContext.nightSequence[engineContext.currentNightStepIndex];
        
        const advanceNightStep = () => {
            engineContext.currentNightStepIndex++;
            if (engineContext.currentNightStepIndex >= engineContext.nightSequence.length) {
                Engine.EventBus.emit('PROCESS_DAWN');
            } else {
                const currentStep = engineContext.nightSequence[engineContext.currentNightStepIndex];
                engineContext.dynamicNightDuration = (currentStep.phaseId === 'midnight') ? 45000 : 20000;
                stateMachine.transitionTo('NIGHT_ACTION');
            }
        };
        if (previousStep && previousStep.phaseId === 'midnight') {
            engineContext.phase = 'MIDNIGHT_RESULT_DISPLAY';
            syncStateToAll();
            setTimeout(() => {
                advanceNightStep();
            }, 3000);
        } else {
            advanceNightStep();
        }
    });

    Engine.EventBus.on('PROCESS_DAWN', () => {
        // [階段 1] 時間軸最前端：判定熊咆哮並觸發獨立階段
        let bearRoarText = null;
        const bearPlayer = engineContext.players.find(p => p.role === '熊' && !p.isDead);
        if (bearPlayer) {
            const leftSeat = engineContext.getNextAliveSeat(bearPlayer.seatNumber, -1);
            const rightSeat = engineContext.getNextAliveSeat(bearPlayer.seatNumber, 1);
            const isWolf = (p) => {
                if (!p) return false;
                const roleName = p.data.camouflageRole || p.role;
                return ROLE_DICTIONARY[roleName]?.faction === 'wolf';
            };
            bearRoarText = (isWolf(engineContext.getPlayer(leftSeat)) || isWolf(engineContext.getPlayer(rightSeat))) 
                ? "【熊有咆哮】" : "【熊沒有咆哮】";
            
            Engine.EventBus.emit('MASTER_LOG', `【熊判定】左側${leftSeat}號，右側${rightSeat}號 ${bearRoarText}`);
            engineContext.bearRoarResult = bearRoarText;
            engineContext.systemLog = bearRoarText;
            stateMachine.transitionTo('BEAR_ROAR_ANNOUNCE');
        } else {
            // 無熊則直接進行下一個階段分流
            engineContext.bearRoarResult = null;
            if (engineContext.rules.sheriff === 'enabled' && !engineContext.sheriff.seat && !engineContext.sheriff.badgeLost) {
                if (!engineContext.sheriff.isDelayedElection) stateMachine.transitionTo('SHERIFF_CANDIDACY');
                else stateMachine.transitionTo('SHERIFF_RE_ELECTION_BAILOUT');
            } else {
                Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
            }
        }
    });

    Engine.EventBus.on('TRIGGER_DEATH_ANNOUNCE', () => {
        // [階段 2] 警長選完後：正式結算昨夜死亡並觸發死訊獨立階段
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
        engineContext.players.forEach(p => {
            if (!p.isDead && deathMap[p.seatNumber]) p.kill(deathMap[p.seatNumber], engineContext);
        });
        engineContext.deadThisNight = engineContext.players
            .filter(p => p.isDead && !deadBefore.includes(p.seatNumber))
            .map(p => p.seatNumber);

        engineContext.nightTags.killed = [];
        engineContext.nightTags.poisoned = [];
        engineContext.guardedSeat = null; 

        Engine.EventBus.emit('CHECK_WIN_CONDITION', engineContext);
        if (engineContext.phase === 'GAME_OVER') return;

        const dead = engineContext.deadThisNight;
        const msg = dead.length > 0 ? `昨晚，${dead.join(' 號、')} 號玩家死亡。` : `昨晚是平安夜。`;
        
        engineContext.deathAnnounceText = msg;
        engineContext.systemLog = msg;
        Engine.EventBus.emit('BROADCAST_MESSAGE', msg);
        
        stateMachine.transitionTo('DAWN_DEATH_ANNOUNCE');
    });

    Engine.EventBus.on('AFTER_DEATH_ANNOUNCE_ROUTINE', () => {
        // [階段 3] 死訊宣告完畢：分配白天發言權並進入常規環節
        const dead = engineContext.deadThisNight || [];
        engineContext.lastWordsTargets = (engineContext.nightCount === 1 && dead.length > 0) ? [...dead] : [];
        
        if (engineContext.sheriff.seat && !engineContext.sheriff.badgeLost) {
            engineContext.dayDiscussionPrompt = `請警長決定發言順序`;
            engineContext.destinationPhase = 'SHERIFF_ORDER_SELECTION';
        } else {
            let startSeat;
            const dirNum = Math.random() < 0.5 ? 1 : -1;
            const dirStr = dirNum === 1 ? '順' : '逆';
            
            if (dead.length === 0) {
                const aliveSeats = engineContext.getAlivePlayers().map(p => p.seatNumber);
                startSeat = aliveSeats[Math.floor(Math.random() * aliveSeats.length)];
            } else {
                const randomDeadSeat = dead[Math.floor(Math.random() * dead.length)];
                startSeat = engineContext.getNextAliveSeat(randomDeadSeat, dirNum);
            }
            
            engineContext.dayDiscussionPrompt = `請從 ${startSeat} 號開始${dirStr}序發言`;
            engineContext.buildSpeakingQueue(startSeat, dirNum);
            engineContext.destinationPhase = 'DAY_DISCUSSION';
        }

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
        if (wolfCount === 0 && ctx.wolvesDiedThisTick && ctx.wolvesDiedThisTick.includes('血月使徒') && !ctx.bloodMoonHasShot) {
            ctx.pendingBloodMoon = ctx.bloodMoonSeat;
            ctx.bloodMoonHasShot = true;
        }
        ctx.wolvesDiedThisTick = [];
        if (ctx.pendingBloodMoon) return;

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
        engineContext.activeShooter = engineContext.pendingHunter; 
        engineContext.pendingHunter = null;
        stateMachine.transitionTo('HUNTER_ACTION');
    } else if (engineContext.pendingWolfKing) {
        engineContext.activeShooter = engineContext.pendingWolfKing; 
        engineContext.pendingWolfKing = null;
        stateMachine.transitionTo('WOLFKING_ACTION');
    } else if (engineContext.pendingBloodMoon) {
        engineContext.activeShooter = engineContext.pendingBloodMoon; // [新增] 鎖定血月使徒開槍座位
        engineContext.pendingBloodMoon = null;
        stateMachine.transitionTo('BLOODMOON_ACTION');
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
    const isDayPhase = ['BEAR_ROAR_ANNOUNCE', 'DAWN_DEATH_ANNOUNCE', 'DAWN_SETTLEMENT', 'SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_TRANSFER', 'SHERIFF_ORDER_SELECTION', 'DAY_DISCUSSION', 'DAY_VOTING', 'DAY_PK_SPEECH', 'DAY_PK_VOTING', 'VOTE_RESULT_DISPLAY', 'POST_VOTE_SKILL', 'PRINCE_SPEECH', 'LAST_WORDS', 'GAME_OVER', 'WOLFKING_ACTION', 'BLOODMOON_ACTION'].includes(ctx.phase);
    const hostState = { // [修復] 補回遺失的物件宣告
        systemLog: ctx.systemLog,
        masterLog: ctx.masterLog || [],
        players: ctx.players.map(p => ({ ...p })),
        layout: { showSetupPanel: ctx.phase === 'LOBBY', showNightPanel: ['NIGHT_TRANSITION', 'NIGHT_ACTION'].includes(ctx.phase), showDayPanel: isDayPhase },
        nightFlow: (ctx.nightSequence || []).map((step, idx) => ({ title: `[${step.phaseName}]`, status: idx < ctx.currentNightStepIndex ? 'completed' : (idx === ctx.currentNightStepIndex ? 'active' : 'pending'), result: step.roles.map(r => r.roleName).join(', ') })),
        allowForceNext: ctx.phase === 'NIGHT_ACTION',
        dayBtnText: getDayBtnText(ctx.phase),
        dayBtnDisabled: ['SHERIFF_CANDIDACY', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_TRANSFER', 'DAY_VOTING', 'DAY_PK_VOTING', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'BLOODMOON_ACTION', 'GAME_OVER'].includes(ctx.phase),
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
    const isSheriffPhase = ['SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING'].includes(ctx.phase);

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
                    const myAct = ctx.currentStepActions.find(act => act.player.seatNumber === player.seatNumber);
                    let actionText = "行動已送出。";
                    let submittedTargets = [];
                    
                    if (myAct) {
                        submittedTargets = myAct.targets || [];
                        if (isAttacker) {
                            actionText = "等待隊友決定。";
                        } else if (myAct.actionId === 'save') {
                            actionText = "已選擇使用解藥。";
                        } else if (myAct.actionId === 'pass' || submittedTargets.length === 0) {
                            actionText = "已選擇跳過行動。";
                        } else if (myAct.actionId === 'swap' && submittedTargets.length === 2) {
                            actionText = `已選擇交換 ${submittedTargets[0]} 號與 ${submittedTargets[1]} 號。`;
                        } else {
                            const map = {
                                'poison': '毒殺', 'guard': '守護', 'charm': '魅惑', 'fear': '恐懼',
                                'dream': '攝夢', 'curse': '詛咒', 'hunt': '狩獵', 'crush': '暗戀',
                                'learn': '學習', 'check': '查驗', 'give_check': '贈與查驗', 
                                'give_poison': '贈與毒藥', 'give_guard': '贈與守護', 'claw_kill': '發動利爪'
                            };
                            let actName = map[myAct.actionId];
                            if (!actName && myAct.actionId === 'confirm' && ['預言家', '燈影預言家', '魔鏡少女'].includes(player.role)) {
                                actName = '查驗';
                            }
                            actName = actName || '指定';
                            actionText = `已選擇${actName} ${submittedTargets.join('、')} 號玩家。`;
                        }
                    }

                    actionPanel.prompt = actionText;
                    actionPanel.buttons = []; 
                    actionPanel.deadline = null;
                    actionPanel.hasActed = true; 
                    actionPanel.submittedTargets = submittedTargets; 
                } else {
                    actionPanel.prompt = plugin.getPrompt(ctx, player.seatNumber);
                }
            } else {
                // [擴充] 神職被恐懼的專屬靜態 UI 回饋
                const isFeared = ctx.fearedSeat === player.seatNumber;
                const isGod = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[player.role]?.type === 'god';
                
                if (isFeared && isGod) {
                    actionPanel.show = true;
                    actionPanel.deadline = ctx.deadline;
                    actionPanel.type = 'none';
                    actionPanel.prompt = "【技能失效】你被恐懼了，今晚無法使用技能";
                    actionPanel.buttons = [];
                    actionPanel.hasActed = true; // 鎖定狀態，防止惡意互動
                }
            }
        }
    } 
    else if (ctx.phase === 'MIDNIGHT_RESULT_DISPLAY') {
        const plugin = RoleRegistry.plugins[player.role];
        const hasWolfChat = plugin?.hasWolfChatAccess === true || (typeof plugin?.hasWolfChatAccess === 'function' && plugin.hasWolfChatAccess(ctx, player));
        
        if (!player.isDead && hasWolfChat) {
            actionPanel.show = true;
            actionPanel.type = 'none';
            actionPanel.prompt = "已確認今晚的襲擊目標";
            actionPanel.forceTargets = true;
            actionPanel.submittedTargets = ctx.nightTags.killed || [];
            actionPanel.buttons = [];
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
        actionPanel.deadline = ctx.deadline;
    }
    else if (['BEAR_ROAR_ANNOUNCE', 'DAWN_DEATH_ANNOUNCE'].includes(ctx.phase)) {
        actionPanel.show = true; 
        actionPanel.deadline = ctx.deadline;
        actionPanel.prompt = ctx.phase === 'BEAR_ROAR_ANNOUNCE' ? ctx.bearRoarResult : ctx.deathAnnounceText;
        actionPanel.buttons = [];
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
    else if (['DAY_DISCUSSION', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'DAY_PK_SPEECH', 'LAST_WORDS', 'PRINCE_SPEECH'].includes(ctx.phase)) {
        actionPanel.show = true; actionPanel.deadline = ctx.deadline;
        if (ctx.speakingDirection) {
            actionPanel.speakingDirection = ctx.speakingDirection;
        }

        let prefixPrompt = "";
        if (ctx.phase === 'DAY_DISCUSSION' && ctx.dayDiscussionPrompt) {
            prefixPrompt = `${ctx.dayDiscussionPrompt}\n\n`;
        } else if (ctx.phase === 'SHERIFF_SPEECH' && ctx.sheriffSpeechPrompt) {
            prefixPrompt = `${ctx.sheriffSpeechPrompt}\n\n`;
        }

        if (player.seatNumber === ctx.currentSpeaker) {
            actionPanel.prompt = `${prefixPrompt}現在是你的發言時間\n發言完畢請點擊結束發言`;
            actionPanel.buttons = []; 
        } else {
            const speakerStr = ctx.currentSpeaker ? `${ctx.currentSpeaker} 號` : "系統計算中";
            actionPanel.prompt = `${prefixPrompt}現在由 ${speakerStr} 玩家發言...`;
            actionPanel.buttons = [];
        }
    }
    else if (ctx.phase === 'HUNTER_ACTION' || ctx.phase === 'WOLFKING_ACTION' || ctx.phase === 'BLOODMOON_ACTION') {
        actionPanel.show = true;
        if (player.seatNumber === ctx.activeShooter) {
            actionPanel.type = 'single_select'; actionPanel.selectableSeats = ctx.getAlivePlayers().map(p=>p.seatNumber);
            actionPanel.prompt = ctx.phase === 'BLOODMOON_ACTION' ? `你已出局，選擇最後追擊目標：` : `你已死亡，選擇開槍目標：`;
            actionPanel.buttons = [{ id: 'shoot', text: ctx.phase === 'BLOODMOON_ACTION' ? '追擊' : '開槍', requiresTarget: true }, { id: 'pass', text: '不開槍', requiresTarget: false }];
        } else {
            actionPanel.prompt = "系統結算中，請等待...";
        }
    }

    if (player.data.tempPrivateMessage) {
        personalMessage += "\n" + player.data.tempPrivateMessage;
        player.data.tempPrivateMessage = null; 
    }

    // ==========================================
    // [視覺革新] 白天面板圖片路由與強制號碼槽映射
    // ==========================================
    if (isDayPhase && actionPanel.show) {
        let bg = null;
        let forcedTargets = null;

        switch(ctx.phase) {
            case 'BEAR_ROAR_ANNOUNCE':
                bg = ctx.bearRoarResult === '【熊有咆哮】' ? 'act_1' : 'act_2';
                forcedTargets = [];
                break;
            case 'DAWN_DEATH_ANNOUNCE':
                const d = ctx.deadThisNight || [];
                bg = d.length === 0 ? 'act_11' : 'act_12';
                forcedTargets = d; 
                break;
            case 'SHERIFF_CANDIDACY': bg = 'act_3'; break;
            case 'SHERIFF_SPEECH': bg = 'act_4'; forcedTargets = ctx.currentSpeaker ? [ctx.currentSpeaker] : []; break;
            case 'SHERIFF_VOTING': bg = 'act_5'; break;
            case 'SHERIFF_PK_SPEECH': bg = 'act_6'; forcedTargets = ctx.currentSpeaker ? [ctx.currentSpeaker] : []; break;
            case 'SHERIFF_PK_VOTING': bg = 'act_7'; break;
            case 'SHERIFF_TRANSFER': bg = 'act_9'; break;
            case 'SHERIFF_ORDER_SELECTION': bg = 'act_10'; break;
            case 'POST_VOTE_SKILL': bg = 'act_16'; forcedTargets = ctx.votedOutToday ? [ctx.votedOutToday] : []; break;
            case 'PRINCE_SPEECH': bg = 'act_15'; forcedTargets = ctx.currentSpeaker ? [ctx.currentSpeaker] : []; break;
            case 'DAY_DISCUSSION': case 'LAST_WORDS': bg = 'act_13'; forcedTargets = ctx.currentSpeaker ? [ctx.currentSpeaker] : []; break;
            case 'DAY_VOTING': bg = 'act_14'; break;
            case 'DAY_PK_SPEECH': bg = 'act_15'; forcedTargets = ctx.currentSpeaker ? [ctx.currentSpeaker] : []; break;
            case 'DAY_PK_VOTING': bg = 'act_14'; break;
            case 'VOTE_RESULT_DISPLAY':
                const str = ctx.currentVoteResultString || '';
                if (str.includes('無人出局') || str.includes('平安')) {
                    bg = 'act_17'; 
                    forcedTargets = [];
                } else if (str.includes('平票')) {
                    if (str.includes('警徽流失') || str.includes('延後至明日')) {
                        bg = 'act_17';
                        forcedTargets = [];
                    } else if (str.includes('警長')) { 
                        bg = 'act_6'; forcedTargets = ctx.sheriff.pkTargets || []; 
                    }
                    else { bg = 'act_15'; forcedTargets = ctx.pkTargets || []; }
                } else if (str.includes('警長誕生')) {
                    bg = 'act_8'; forcedTargets = [ctx.sheriff.seat];
                } else {
                    bg = 'act_16'; forcedTargets = ctx.votedOutToday ? [ctx.votedOutToday] : [];
                }
                break;
        }

        if (bg) {
            actionPanel.bgImage = bg;
            actionPanel.prompt = "";
            if (forcedTargets !== null) {
                actionPanel.forceTargets = true;
                actionPanel.submittedTargets = forcedTargets;
            }
        }
    }

    // ==========================================
    // [擴充] 全域防呆過濾：過濾帶有「不可被指定」狀態的玩家
    // 完全解耦，host.js 不涉入任何角色邏輯
    // ==========================================
    if (actionPanel.selectableSeats && actionPanel.selectableSeats.length > 0) {
        actionPanel.selectableSeats = actionPanel.selectableSeats.filter(seat => {
            const targetPlayer = ctx.players.find(p => p.seatNumber === seat);
            return !(targetPlayer && targetPlayer.data.isUntargetable);
        });
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
        daySkill: (isDayPhase && RoleRegistry.plugins[player.role]?.daySkill && RoleRegistry.plugins[player.role].daySkill.allowedPhases.includes(ctx.phase) && (!player.isDead || RoleRegistry.plugins[player.role].daySkill.allowDead) && !player.data.hasUsedDaySkill) ? {
            id: RoleRegistry.plugins[player.role].daySkill.id,
            buttonText: RoleRegistry.plugins[player.role].daySkill.buttonText,
            requiresTarget: RoleRegistry.plugins[player.role].daySkill.requiresTarget,
            selectableSeats: RoleRegistry.plugins[player.role].daySkill.requiresTarget ? RoleRegistry.plugins[player.role].daySkill.getSelectableSeats(ctx, player.seatNumber) : []
        } : null,
        allowBailout: !player.isDead && ['SHERIFF_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT'].includes(ctx.phase) && (ctx.sheriff.candidates || []).includes(player.seatNumber),
        allowEndSpeech: player.seatNumber === ctx.currentSpeaker
    };
}

function getPhaseMessageForPlayer(phase, ctx) {
    const dict = { 
        'NIGHT_TRANSITION': "天黑請閉眼...", 'NIGHT_ACTION': "夜間行動中...", 
        'MIDNIGHT_RESULT_DISPLAY': "夜間行動中...",
        'BEAR_ROAR_ANNOUNCE': "熊咆哮結果展示...", 'DAWN_DEATH_ANNOUNCE': "宣告昨晚死訊...",
        'SHERIFF_CANDIDACY': "登記上警意願...", 'SHERIFF_ORDER_SELECTION': "決定發言順序中...",
        'SHERIFF_SPEECH': ctx ? (ctx.sheriffSpeechPrompt || "警長發言中...") : "警長發言中...", 
        'SHERIFF_RE_ELECTION_BAILOUT': "延遲選舉退水時間...", 'SHERIFF_PK_SPEECH': "警長 PK 發言...", 
        'SHERIFF_VOTING': "警長首次投票...", 'SHERIFF_PK_VOTING': "警長 PK 投票...", 
        'SHERIFF_TRANSFER': "移交警徽中...", 'DAY_DISCUSSION': ctx ? (ctx.dayDiscussionPrompt || "白天發言階段。") : "白天發言階段。",
        'DAY_VOTING': "放逐投票...", 'DAY_PK_SPEECH': "放逐 PK 發言...", 'DAY_PK_VOTING': "放逐 PK 投票...", 
        'VOTE_RESULT_DISPLAY': "展示投票結果...", 'POST_VOTE_SKILL': "等待投票後技能發動...", 'PRINCE_SPEECH': ctx ? (ctx.dayDiscussionPrompt || "定序王子發言中...") : "定序王子發言中...", 'LAST_WORDS': "遺言發表。", 'HUNTER_ACTION': "系統結算中...", 
        'WOLFKING_ACTION': "系統結算中...", 'GAME_OVER': engineContext ? engineContext.systemLog : "遊戲結束。"
    };
    return dict[phase] || "等待中...";
}

function getDayBtnText(phase) {
    const dict = { 'BEAR_ROAR_ANNOUNCE': "結束展示，進入下一階段", 'DAWN_DEATH_ANNOUNCE': "結束展示，進入下一階段", 'SHERIFF_CANDIDACY': "強制結束上警登記", 'SHERIFF_VOTING': "強制結算投票", 'SHERIFF_PK_VOTING': "強制結算投票", 'SHERIFF_SPEECH': "發起警長投票", 'SHERIFF_PK_SPEECH': "發起警長 PK 投票", 'DAY_DISCUSSION': "發起放逐投票", 'DAY_PK_SPEECH': "發起放逐 PK 投票", 'VOTE_RESULT_DISPLAY': "結束展示，進入下一階段", 'POST_VOTE_SKILL': "結束技能等待", 'PRINCE_SPEECH': "發起放逐投票", 'LAST_WORDS': "結束遺言，進入下一階段", 'SHERIFF_TRANSFER': "等待警長移交...", 'HUNTER_ACTION': "等待獵人開槍...", 'WOLFKING_ACTION': "等待狼王開槍...", 'BLOODMOON_ACTION': "等待血月使徒發動技能..." };
    return dict[phase] || "投票/行動進行中...";
}

function getDayBtnCommand(phase) {
    const dict = { 'BEAR_ROAR_ANNOUNCE': "FORCE_TIMEOUT", 'DAWN_DEATH_ANNOUNCE': "FORCE_TIMEOUT", 'SHERIFF_CANDIDACY': "FORCE_TIMEOUT", 'SHERIFF_VOTING': "FORCE_TIMEOUT", 'SHERIFF_PK_VOTING': "FORCE_TIMEOUT", 'SHERIFF_SPEECH': "START_SHERIFF_VOTE", 'SHERIFF_PK_SPEECH': "START_SHERIFF_PK_VOTE", 'DAY_DISCUSSION': "START_VOTE", 'DAY_PK_SPEECH': "START_DAY_PK_VOTE", 'VOTE_RESULT_DISPLAY': "END_VOTE_DISPLAY", 'POST_VOTE_SKILL': "FORCE_TIMEOUT", 'PRINCE_SPEECH': "START_VOTE", 'LAST_WORDS': "END_LAST_WORDS" };
    return dict[phase] || "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT' || cmd === 'FORCE_TIMEOUT') {
        stateMachine.clearTimer();
        if (stateMachine.currentPhase && stateMachine.currentPhase.onTimeout) stateMachine.currentPhase.onTimeout(engineContext);
    } 
    else if (cmd === 'START_SHERIFF_VOTE') stateMachine.transitionTo('SHERIFF_VOTING');
    else if (cmd === 'START_SHERIFF_PK_VOTE') stateMachine.transitionTo('SHERIFF_PK_VOTING'); 
    else if (cmd === 'START_VOTE') { engineContext.routineOrigin = 'AFTERNOON'; stateMachine.transitionTo('DAY_VOTING'); }
    else if (cmd === 'START_DAY_PK_VOTE') { engineContext.routineOrigin = 'AFTERNOON'; stateMachine.transitionTo('DAY_PK_VOTING'); } 
    else if (cmd === 'END_VOTE_DISPLAY') {
        if (engineContext.postVoteSkillPhasePending) {
            engineContext.postVoteSkillPhasePending = false;
            const hasSpecialRoles = engineContext.players.some(p => RoleRegistry.plugins[p.role]?.hasPostVoteSkill);
            if (hasSpecialRoles) {
                stateMachine.transitionTo('POST_VOTE_SKILL');
                return;
            }
        }
        if (engineContext.nextPhaseAfterVoteDisplay === 'DAWN_RESUME') Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
        else if (engineContext.nextPhaseAfterVoteDisplay === 'RESUME_ROUTINE') resumeRoutinePhase();
        else if (engineContext.nextPhaseAfterVoteDisplay) stateMachine.transitionTo(engineContext.nextPhaseAfterVoteDisplay);
    }
    else if (cmd === 'END_LAST_WORDS') { engineContext.lastWordsTargets = []; resumeRoutinePhase(); }
}
