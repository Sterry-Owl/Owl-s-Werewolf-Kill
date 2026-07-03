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
        engineContext.players.forEach(p => p.data.tempPrivateMessage = msg);
        syncStateToAll();
    });

    engineContext.systemLog = '⏳ 正在與連線伺服器建立通道，請稍候...';
    syncStateToAll();

    hostPeer = new Peer(roomId, PEER_CONFIG);
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
    else if (data.type === PACKET_TYPE.SHERIFF_BAILOUT && engineContext.phase === 'SHERIFF_SPEECH') {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && (engineContext.sheriff.candidates || []).includes(player.seatNumber)) {
            engineContext.sheriff.candidates = engineContext.sheriff.candidates.filter(s => s !== player.seatNumber);
            engineContext.sheriff.withdrawn.push(player.seatNumber);
            engineContext.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇退水！`;
            syncStateToAll();
        }
    }
    else if (data.type === PACKET_TYPE.WOLF_EXPLODE) {
        // [防呆機制] 如果狼人在警長競選期間自爆，強制立刻結算昨晚死者，避免死者逃過一劫
        if (['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING'].includes(engineContext.phase)) {
            engineContext.players.forEach(p => {
                if (!p.isDead && (engineContext.nightTags.killed.includes(p.seatNumber) || engineContext.nightTags.poisoned.includes(p.seatNumber))) {
                    p.kill(engineContext.nightTags.poisoned.includes(p.seatNumber) ? 'poisoned' : 'killed', engineContext);
                }
            });
            engineContext.nightTags.killed = [];
            engineContext.nightTags.poisoned = [];
        }
        Engine.EventBus.emit('WOLF_EXPLODE', { context: engineContext, player: engineContext.getPlayerByPeer(peerId) });
    }
    else if (data.type === PACKET_TYPE.WOLF_PREVIEW) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && player.role && RoleRegistry.plugins[player.role]?.canSeeWolves && engineContext.phase === 'NIGHT_ACTION') {
            engineContext.wolfPreviews[peerId] = { seat: player.seatNumber, target: data.payload.target };
            syncStateToAll();
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
        engineContext.cursedSeat = null;
        engineContext.players.forEach(p => p.data.latestCheckResult = null);
        
        const alive = engineContext.getAlivePlayers();
        let phases = { 'first_half': [], 'midnight': [], 'second_half': [] };
        alive.forEach(p => {
            const def = RoleRegistry.plugins[p.role];
            if (def && def.nightPhase) {
                // [神級架構] 將 def.nightPhase 轉為陣列，支援多階段覺醒
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
            stateMachine.transitionTo('NIGHT_ACTION');
        }
    });

    Engine.EventBus.on('PROCESS_DAWN', () => {
        engineContext.sheriff.electionFinishedToday = false; 
        
        // [關鍵修復] 移除這裡的 p.kill() 死亡結算，讓死者活著參與警長競選

        if (engineContext.rules.sheriff === 'enabled' && !engineContext.sheriff.seat && !engineContext.sheriff.badgeLost && engineContext.sheriff.electionDay <= 2) {
            stateMachine.transitionTo('SHERIFF_CANDIDACY');
        } else {
            Engine.EventBus.emit('DAWN_ANNOUNCE');
        }
    });

    Engine.EventBus.on('DAWN_ANNOUNCE', () => {
        engineContext.deadThisNight = [];
        engineContext.hunterDiedThisNight = false;

        // [新架構] 收集黑夜標籤，準備交給過濾器運算
        const calculation = {
            killed: [...engineContext.nightTags.killed],
            poisoned: [...engineContext.nightTags.poisoned],
            saved: engineContext.witchState?.savedSeat ? [engineContext.witchState.savedSeat] : [],
            guarded: engineContext.guardedSeat ? [engineContext.guardedSeat] : []
        };

        // 呼叫過濾器，由 role.js 裡的守衛/女巫插件去算「同守同救」
        const finalKilledList = engineContext.applyFilter('DAWN_DEATH_EVALUATION', calculation);

        // 最終死亡判定執行
        engineContext.players.forEach(p => {
            if (p.isDead) return;
            
            const isKilled = finalKilledList.includes(p.seatNumber);
            const isPoisoned = engineContext.nightTags.poisoned.includes(p.seatNumber); // 毒藥強制致死，不進入守衛過濾

            if (isKilled || isPoisoned) {
                p.kill(isPoisoned ? 'poisoned' : 'killed', engineContext);
                engineContext.deadThisNight.push(p.seatNumber);
            }
        });
        
        // 清理昨晚標籤
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
        engineContext.isPK = false;
        
        engineContext.routineOrigin = 'MORNING'; 
        engineContext.destinationPhase = 'DAY_DISCUSSION';
        resumeRoutinePhase();
    });

    Engine.EventBus.on('FORCE_ENTER_NIGHT', () => setTimeout(() => Engine.EventBus.emit('START_NIGHT'), 4000));
    
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
    const deadSheriff = engineContext.players.find(p => p.isDead && p.seatNumber === engineContext.sheriff.seat);
    if (deadSheriff && !engineContext.sheriff.badgeLost) {
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
    const isDayPhase = ['DAWN_SETTLEMENT', 'SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING', 'SHERIFF_TRANSFER', 'DAY_DISCUSSION', 'DAY_VOTING', 'PK_SPEECH', 'PK_VOTING', 'VOTE_RESULT_DISPLAY', 'LAST_WORDS', 'GAME_OVER', 'WOLFKING_ACTION'].includes(ctx.phase);

    const hostState = {
        systemLog: ctx.systemLog,
        players: ctx.players.map(p => ({ ...p })),
        layout: {
            showSetupPanel: ctx.phase === 'LOBBY',
            showNightPanel: ['NIGHT_TRANSITION', 'NIGHT_ACTION'].includes(ctx.phase),
            showDayPanel: isDayPhase
        },
        nightFlow: (ctx.nightSequence || []).map((step, idx) => ({
            title: `[${step.phaseName}]`,
            status: idx < ctx.currentNightStepIndex ? 'completed' : (idx === ctx.currentNightStepIndex ? 'active' : 'pending'),
            result: step.roles.map(r => r.roleName).join(', ')
        })),
        allowForceNext: ctx.phase === 'NIGHT_ACTION',
        dayBtnText: getDayBtnText(ctx.phase),
        dayBtnDisabled: ['SHERIFF_CANDIDACY', 'SHERIFF_VOTING', 'SHERIFF_TRANSFER', 'DAY_VOTING', 'PK_VOTING', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'GAME_OVER'].includes(ctx.phase),        dayBtnCommand: getDayBtnCommand(ctx.phase)
    };
    UI.renderHostView(hostState, handleHostCommand);

    ctx.players.forEach(player => {
        if (connections[player.peerId]) {
            try {
                connections[player.peerId].send({ type: PACKET_TYPE.STATE_SYNC, payload: buildUIStateForPlayer(ctx, player, isDayPhase) });
            } catch (e) {
                console.error(`玩家 ${player.seatNumber} 狀態同步失敗:`, e);
            }
        }
    });
}

function buildUIStateForPlayer(ctx, player, isDayPhase) {
    // [新增] 嚴格判定當前是否處於「警長競選」的三個階段
    const isSheriffPhase = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING'].includes(ctx.phase);

    // ==========================================
    // 1. 處理每個玩家座位上的標籤與狀態
    // ==========================================
    const mappedPlayers = ctx.players.map(p => {
        let topTag = null, sideTag = null, wolfPreviewTags = [];
        
        if (ctx.phase === 'GAME_OVER' || p.seatNumber === player.seatNumber || p.isRevealed) topTag = p.role;
        else if (RoleRegistry.plugins[player.role]?.canSeeWolves && RoleRegistry.plugins[p.role]?.seenAsWolf) topTag = p.role;
        
        if (player.data.seerRecords && player.data.seerRecords[p.seatNumber]) sideTag = player.data.seerRecords[p.seatNumber]; 
        else if (player.role === '女巫' && ctx.witchState?.savedSeat === p.seatNumber) sideTag = "銀水"; 

        // [正確的位置] 狼人互相看到的預覽標籤 (石像鬼看不見)
        if (ctx.phase === 'NIGHT_ACTION' && RoleRegistry.plugins[player.role]?.canSeeWolves) {
            Object.values(ctx.wolfPreviews || {}).forEach(preview => {
                if (String(preview.target) === String(p.seatNumber) && preview.seat !== player.seatNumber) {
                    wolfPreviewTags.push(`${preview.seat}號`);
                }
            });
        }

        return { 
            seatNumber: p.seatNumber, name: p.name, isDead: p.isDead, 
            topTag, sideTag, wolfPreviewTags, isWolfSelected: wolfPreviewTags.length > 0,
            isCandidate: isSheriffPhase && (ctx.sheriff.candidates || []).includes(p.seatNumber), 
            hasWithdrawn: isSheriffPhase && (ctx.sheriff.withdrawn || []).includes(p.seatNumber),
            isSheriff: (ctx.sheriff.seat === p.seatNumber),
            isPKTarget: (ctx.phase === 'PK_SPEECH' || ctx.phase === 'PK_VOTING') && (ctx.pkTargets || []).includes(p.seatNumber)
        };
    });

    let actionPanel = { show: false, type: 'none', prompt: '', selectableSeats: [], buttons: [], submitPacketType: PACKET_TYPE.ACTION_SUBMIT };
    let personalMessage = getPhaseMessageForPlayer(ctx.phase);

    // ==========================================
    // 2. 處理玩家本人的行動面板 (Action Panel)
    // ==========================================
    if (ctx.phase === 'NIGHT_ACTION' && !player.isDead) {
        const currentPhase = ctx.nightSequence[ctx.currentNightStepIndex];
        let myRoleInPhase = currentPhase ? currentPhase.roles.find(r => r.activePlayers.some(ap => ap.seatNumber === player.seatNumber)) : null;
        const hasActed = ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber);
        
        if (myRoleInPhase) {
            const plugin = RoleRegistry.plugins[myRoleInPhase.roleName];
            // [權限守衛] 使用 hasAction 攔截不需要行動的面板 (解決石像鬼問題)
            const canAct = plugin.hasAction ? plugin.hasAction(ctx, player.seatNumber) : true;
            
            if (canAct) {
                actionPanel.show = true;
                actionPanel.deadline = ctx.deadline;
                actionPanel.type = plugin.actionType;
                actionPanel.selectableSeats = plugin.getSelectableSeats(ctx, player.seatNumber);
                actionPanel.buttons = plugin.getButtons(ctx, player.seatNumber);
                actionPanel.passTags = plugin.getPassTags ? plugin.getPassTags(ctx, player.seatNumber) : [];
                
                if (RoleRegistry.plugins[myRoleInPhase.roleName]?.isAttacker) {
                    const myPreview = ctx.wolfPreviews[player.peerId];
                    if (myPreview && myPreview.target !== 'pass') actionPanel.preSelectedTarget = parseInt(myPreview.target);
                } else {
                    actionPanel.preSelectedTarget = plugin.getPreSelectedTarget ? plugin.getPreSelectedTarget(ctx) : null; 
                }

                if (hasActed) {
                    actionPanel.prompt = (RoleRegistry.plugins[myRoleInPhase.roleName]?.isAttacker) ? "等待隊友決定。" : "行動已送出。";
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
    else if (ctx.phase === 'SHERIFF_VOTING' && !player.isDead) {
        actionPanel.show = true;
        const isEligible = !(ctx.sheriff.candidates || []).includes(player.seatNumber) && !(ctx.sheriff.withdrawn || []).includes(player.seatNumber);
        if (!isEligible) { actionPanel.prompt = "你是警上玩家（或已退水），無法參與警長投票。"; actionPanel.buttons = []; }
        else if (ctx.votes[player.seatNumber] !== undefined) { actionPanel.prompt = "投票完成，等待..."; actionPanel.buttons = []; }
        else {
            actionPanel.type = 'single_select'; actionPanel.deadline = ctx.deadline; actionPanel.selectableSeats = ctx.sheriff.candidates || [];
            actionPanel.prompt = '選擇你要投票的警長候選人：';
            actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
            actionPanel.buttons = [{ id: 'vote', text: '投票', requiresTarget: true }, { id: 'pass', text: '棄票', requiresTarget: false }];
        }
    }
    else if (ctx.phase === 'SHERIFF_TRANSFER' && player.seatNumber === ctx.sheriff.seat) {
        actionPanel.show = true; actionPanel.type = 'single_select'; actionPanel.selectableSeats = ctx.getAlivePlayers().map(p=>p.seatNumber);
        actionPanel.prompt = '你已死亡。選擇移交警徽，或撕毀：';
        actionPanel.buttons = [{ id: 'transfer', text: '移交警徽', requiresTarget: true }, { id: 'pass', text: '撕毀警徽', requiresTarget: false }];
    }
    else if ((ctx.phase === 'DAY_VOTING' || ctx.phase === 'PK_VOTING') && !player.isDead) {
        actionPanel.show = true;
        const isPK = ctx.phase === 'PK_VOTING';
        if (isPK && (ctx.pkTargets || []).includes(player.seatNumber)) { actionPanel.prompt = "你是 PK 發言對象，無法投票。"; actionPanel.buttons = []; }
        else if (ctx.votes[player.seatNumber] !== undefined) { actionPanel.prompt = "投票完成，等待..."; actionPanel.buttons = []; }
        else {
            actionPanel.type = 'single_select'; actionPanel.deadline = ctx.deadline; actionPanel.selectableSeats = isPK ? ctx.pkTargets : ctx.getAlivePlayers().map(p=>p.seatNumber);
            actionPanel.prompt = isPK ? '選擇 PK 目標：' : '選擇放逐目標：';
            if (ctx.sheriff.seat === player.seatNumber) actionPanel.prompt += '\n(你是警長，擁有 1.5 票)';
            actionPanel.submitPacketType = PACKET_TYPE.VOTE_SUBMIT;
            actionPanel.buttons = [{ id: 'vote', text: '投票', requiresTarget: true }, { id: 'pass', text: '棄票', requiresTarget: false }];
        }
    }
    else if (ctx.phase === 'VOTE_RESULT_DISPLAY') {
        actionPanel.show = true; actionPanel.prompt = ctx.currentVoteResultString;
    }
    else if (ctx.phase === 'LAST_WORDS' || ctx.phase === 'PK_SPEECH') {
        actionPanel.show = true;
        let targets = ctx.phase === 'PK_SPEECH' ? [...(ctx.pkTargets||[])] : [...(ctx.lastWordsTargets||[])].sort((a,b)=>a-b);
        actionPanel.prompt = `請 ${targets.join('號、')} 號玩家${ctx.phase === 'PK_SPEECH' ? "PK 發言" : "發表遺言"}`;
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
    return {
        boardName: ctx.boardName, phase: ctx.phase, 
        nightStepIndex: ctx.currentNightStepIndex,
        mySeat: player.seatNumber, myRole: player.role,
        message: personalMessage, players: mappedPlayers, actionPanel, latestCheckResult: player.data.latestCheckResult || null,
        voteHistory: ctx.voteHistory, 
        allowSelfExplode: !player.isDead && isDayPhase && RoleRegistry.plugins[player.role]?.canSelfExplode,
        daySkill: (!player.isDead && isDayPhase && RoleRegistry.plugins[player.role]?.daySkill) ? {
            id: RoleRegistry.plugins[player.role].daySkill.id,
            buttonText: RoleRegistry.plugins[player.role].daySkill.buttonText,
            requiresTarget: RoleRegistry.plugins[player.role].daySkill.requiresTarget,
            selectableSeats: RoleRegistry.plugins[player.role].daySkill.getSelectableSeats(ctx, player.seatNumber)
        } : null,
        allowBailout: !player.isDead && ctx.phase === 'SHERIFF_SPEECH' && (ctx.sheriff.candidates || []).includes(player.seatNumber) 
    };
}

function getPhaseMessageForPlayer(phase) {
    const dict = { 'NIGHT_TRANSITION': "天黑請閉眼...", 'NIGHT_ACTION': "夜間行動中...", 'SHERIFF_CANDIDACY': "登記上警意願...", 'SHERIFF_SPEECH': "警長發言中...", 'SHERIFF_VOTING': "警長投票...", 'SHERIFF_TRANSFER': "移交警徽中...", 'DAY_DISCUSSION': "白天發言階段。", 'DAY_VOTING': "放逐投票...", 'PK_SPEECH': "PK 發言...", 'PK_VOTING': "PK 投票...", 'VOTE_RESULT_DISPLAY': "展示投票結果...", 'LAST_WORDS': "遺言發表。", 'HUNTER_ACTION': "系統結算中...", 'WOLFKING_ACTION': "系統結算中...", 'GAME_OVER': "遊戲結束。" };
    return dict[phase] || "等待中...";
}

function getDayBtnText(phase) {
    const dict = { 'SHERIFF_CANDIDACY': "強制結束上警登記 (防卡死)", 'SHERIFF_VOTING': "強制結算警長投票 (防卡死)", 'SHERIFF_SPEECH': "發起警長投票", 'DAY_DISCUSSION': "發起放逐投票", 'PK_SPEECH': "發起 PK 投票", 'VOTE_RESULT_DISPLAY': "結束展示，進入遺言發表階段", 'LAST_WORDS': "結束遺言，進入下一階段", 'SHERIFF_TRANSFER': "等待警長移交...", 'HUNTER_ACTION': "等待獵人開槍...", 'WOLFKING_ACTION': "等待狼王開槍..." };
    return dict[phase] || "投票/行動進行中...";
}

function getDayBtnCommand(phase) {
    const dict = { 'SHERIFF_CANDIDACY': "FORCE_TIMEOUT", 'SHERIFF_VOTING': "FORCE_TIMEOUT", 'SHERIFF_SPEECH': "START_SHERIFF_VOTE", 'DAY_DISCUSSION': "START_VOTE", 'PK_SPEECH': "START_PK_VOTE", 'VOTE_RESULT_DISPLAY': "END_VOTE_DISPLAY", 'LAST_WORDS': "END_LAST_WORDS" };
    return dict[phase] || "";
}

function handleHostCommand(cmd) {
    if (cmd === 'FORCE_NEXT' || cmd === 'FORCE_TIMEOUT') {
        stateMachine.clearTimer();
        if (stateMachine.currentPhase && stateMachine.currentPhase.onTimeout) stateMachine.currentPhase.onTimeout(engineContext);
    } 
    else if (cmd === 'START_SHERIFF_VOTE') stateMachine.transitionTo('SHERIFF_VOTING');
    else if (cmd === 'START_VOTE') {
        engineContext.routineOrigin = 'AFTERNOON'; 
        stateMachine.transitionTo('DAY_VOTING');
    }
    else if (cmd === 'START_PK_VOTE') {
        engineContext.routineOrigin = 'AFTERNOON';
        stateMachine.transitionTo('PK_VOTING');
    }
    else if (cmd === 'END_VOTE_DISPLAY') {
        if (engineContext.nextPhaseAfterVoteDisplay === 'DAWN_RESUME') Engine.EventBus.emit('DAWN_ANNOUNCE');
        else if (engineContext.nextPhaseAfterVoteDisplay === 'RESUME_ROUTINE') resumeRoutinePhase();
        else if (engineContext.nextPhaseAfterVoteDisplay) stateMachine.transitionTo(engineContext.nextPhaseAfterVoteDisplay);
    }
    else if (cmd === 'END_LAST_WORDS') {
        engineContext.lastWordsTargets = [];
        resumeRoutinePhase();
    }
}
