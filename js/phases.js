// ==========================================
// v4.0.3 遊戲階段模組 (Phase State Handlers)
// 檔案位置: js/phases.js
// ==========================================

window.PhaseRegistry = {
    sm: null, 
    
    init: function(stateMachine, ctx) {
        this.sm = stateMachine;
        const self = this; 
        // [修改] 綁定 phaseIdStr 參數，徹底消除非同步狀態切換時 ctx.phase 的時差死鎖
        const createSpeechPhase = (nextPhaseName, durationMs = 120000, phaseIdStr = null) => ({
            allowDeadAction: true,
            onEnter: (ctx) => {
                const currentPhase = phaseIdStr || ctx.phase; // 優先使用靜態綁定的階段名稱
                
                let nextSpeaker = null;
                while (ctx.speakingQueue && ctx.speakingQueue.length > 0) {
                    const candidateSeat = ctx.speakingQueue.shift();
                    const p = ctx.getPlayer(candidateSeat);
                    
                    if (!p) continue;
                    // [修復] 使用 currentPhase 判定，確保死亡的玩家在專屬遺言階段能 100% 通過發言權驗證
                    if (p.isDead && !['LAST_WORDS', 'DAY_SKILL_LAST_WORDS'].includes(currentPhase)) continue; 
                    
                    if (currentPhase === 'SHERIFF_SPEECH' || currentPhase === 'SHERIFF_PK_SPEECH') {
                        if (!(ctx.sheriff.candidates || []).includes(candidateSeat)) continue;
                    }
                    if (currentPhase === 'DAY_PK_SPEECH') {
                        if (!(ctx.pkTargets || []).includes(candidateSeat)) continue;
                    }
                    
                    nextSpeaker = candidateSeat;
                    break;
                }
                
                if (nextSpeaker === null) {
                    ctx.currentSpeaker = null;
                    ctx.systemLog = "發言環節結束。";
                    
                    // [修復] 確保佇列被正確清空，打破無限重返的死迴圈
                    if (currentPhase === 'LAST_WORDS') {
                        ctx.lastWordsTargets = [];
                    }
                    if (currentPhase === 'DAY_SKILL_LAST_WORDS') {
                        ctx.daySkillLastWordsQueue = [];
                    }
                    
                    if (nextPhaseName === 'RESUME_ROUTINE') {
                        Engine.EventBus.emit('RESUME_ROUTINE');
                    } else {
                        self.sm.transitionTo(nextPhaseName);
                    }
                    return;
                }
                
                ctx.currentSpeaker = nextSpeaker;
                ctx.systemLog = `現在由 ${ctx.currentSpeaker} 號玩家發言`;
                self.sm.setTimer(durationMs);
            },
            onAction: (ctx, player, actionId) => {
                const currentPhase = phaseIdStr || ctx.phase;
                if (actionId === 'end_speech' && player.seatNumber === ctx.currentSpeaker) {
                    self.sm.clearTimer();
                    ctx.systemLog = `${player.seatNumber} 號玩家結束發言。`;
                    
                    if (currentPhase === 'LAST_WORDS' && ctx.speakingQueue.length === 0) {
                        ctx.lastWordsTargets = [];
                        if (ctx.routineOrigin === 'MORNING') { Engine.EventBus.emit('RESUME_ROUTINE'); return; }
                    }
                    if (currentPhase === 'DAY_SKILL_LAST_WORDS' && ctx.speakingQueue.length === 0) {
                        ctx.daySkillLastWordsQueue = [];
                        if (ctx.routineOrigin === 'MORNING') { Engine.EventBus.emit('RESUME_ROUTINE'); return; }
                    }
                    
                    self.sm.transitionTo(currentPhase); 
                }
            },
            onTimeout: (ctx) => {
                const currentPhase = phaseIdStr || ctx.phase;
                ctx.systemLog = `${ctx.currentSpeaker} 號玩家發言時間到。`;
                
                if (currentPhase === 'LAST_WORDS' && ctx.speakingQueue.length === 0) {
                    ctx.lastWordsTargets = [];
                    if (ctx.routineOrigin === 'MORNING') { Engine.EventBus.emit('RESUME_ROUTINE'); return; }
                }
                if (currentPhase === 'DAY_SKILL_LAST_WORDS' && ctx.speakingQueue.length === 0) {
                    ctx.daySkillLastWordsQueue = [];
                    if (ctx.routineOrigin === 'MORNING') { Engine.EventBus.emit('RESUME_ROUTINE'); return; }
                }
                
                self.sm.transitionTo(currentPhase); 
            }
        });

        // [更新] 全面升級階段註冊，注入精確的時長與強綁定名稱
        stateMachine.registerPhase('DAY_DISCUSSION', createSpeechPhase('DAY_VOTING', 120000, 'DAY_DISCUSSION'));
        stateMachine.registerPhase('SHERIFF_SPEECH', createSpeechPhase('SHERIFF_VOTING', 120000, 'SHERIFF_SPEECH'));
        stateMachine.registerPhase('SHERIFF_PK_SPEECH', createSpeechPhase('SHERIFF_PK_VOTING', 120000, 'SHERIFF_PK_SPEECH'));
        stateMachine.registerPhase('DAY_PK_SPEECH', createSpeechPhase('DAY_PK_VOTING', 120000, 'DAY_PK_SPEECH'));
        stateMachine.registerPhase('LAST_WORDS', createSpeechPhase('RESUME_ROUTINE', 120000, 'LAST_WORDS'));
        stateMachine.registerPhase('DAY_SKILL_LAST_WORDS', createSpeechPhase('RESUME_ROUTINE', 60000, 'DAY_SKILL_LAST_WORDS'));
        stateMachine.registerPhase('PRINCE_SPEECH', createSpeechPhase('DAY_VOTING', 120000, 'PRINCE_SPEECH'));
        
        stateMachine.registerPhase('POST_VOTE_SKILL', {
            onEnter: (ctx) => {
                ctx.systemLog = "等待發動投票後技能 (10秒)..."
                self.sm.setTimer(10000);
            },
            onTimeout: (ctx) => {
                if (ctx.nextPhaseAfterVoteDisplay === 'DAWN_RESUME') Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
                else if (ctx.nextPhaseAfterVoteDisplay === 'RESUME_ROUTINE') Engine.EventBus.emit('RESUME_ROUTINE');
                else if (ctx.nextPhaseAfterVoteDisplay) self.sm.transitionTo(ctx.nextPhaseAfterVoteDisplay);
            }
        });

        stateMachine.registerPhase('VOTE_RESULT_DISPLAY', {
            onEnter: (ctx) => {
                self.sm.setTimer(3000); 
            },
            onTimeout: (ctx) => {
                if (ctx.postVoteSkillPhasePending) {
                    ctx.postVoteSkillPhasePending = false;
                    const hasSpecialRoles = ctx.players.some(p => RoleRegistry.plugins[p.role]?.hasPostVoteSkill);
                    if (hasSpecialRoles && !ctx.postVoteSkillTriggeredThisDay) {
                        ctx.postVoteSkillTriggeredThisDay = true;
                        self.sm.transitionTo('POST_VOTE_SKILL');
                        return;
                    }
                }
                if (ctx.nextPhaseAfterVoteDisplay === 'DAWN_RESUME') Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
                else if (ctx.nextPhaseAfterVoteDisplay === 'RESUME_ROUTINE') Engine.EventBus.emit('RESUME_ROUTINE');
                else if (ctx.nextPhaseAfterVoteDisplay) self.sm.transitionTo(ctx.nextPhaseAfterVoteDisplay);
            }
        });

        stateMachine.registerPhase('BEAR_ROAR_ANNOUNCE', {
            onEnter: (ctx) => {
                self.sm.setTimer(3000);
            },
            onTimeout: (ctx) => {
                if (ctx.rules.sheriff === 'enabled' && !ctx.sheriff.seat && !ctx.sheriff.badgeLost) {
                    if (!ctx.sheriff.isDelayedElection) self.sm.transitionTo('SHERIFF_CANDIDACY');
                    else self.sm.transitionTo('SHERIFF_RE_ELECTION_BAILOUT');
                } else {
                    Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
                }
            }
        });

        stateMachine.registerPhase('DAWN_DEATH_ANNOUNCE', {
            onEnter: (ctx) => {
                self.sm.setTimer(3000);
            },
            onTimeout: (ctx) => {
                Engine.EventBus.emit('AFTER_DEATH_ANNOUNCE_ROUTINE');
            }
        });

        stateMachine.registerPhase('DAY_INTERRUPT_SKILL', {
            onEnter: (ctx) => {
                ctx.expectedActionCount = 1;
                ctx.currentStepActions = [];
                ctx.systemLog = "等待特殊技能發動...";
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.interruptInitiator) return;
                if (ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber)) return;
                ctx.currentStepActions.push({ player, actionId, targets });
                self.resolveInterruptSkill(ctx);
            },
            onTimeout: (ctx) => self.resolveInterruptSkill(ctx)
        });

        stateMachine.registerPhase('DELAYED_DEATH_ANNOUNCE', {
            onEnter: (ctx) => {
                self.sm.setTimer(3000);
            },
            onTimeout: (ctx) => {
                if (ctx.phase === 'GAME_OVER') return;
                const dead = ctx.deadThisNight || [];
                ctx.lastWordsTargets = (ctx.nightCount === 1 && dead.length > 0) ? [...dead] : [];

                ctx.destinationPhase = 'DAY_VOTING';
                ctx.routineOrigin = 'AFTERNOON';
                Engine.EventBus.emit('RESUME_ROUTINE');
            }
        });
        
        stateMachine.registerPhase('SHERIFF_ORDER_SELECTION', {
            onEnter: (ctx) => {
                ctx.systemLog = "等待警長決定發言順序...";
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId) => {
                if (player.seatNumber !== ctx.sheriff.seat) return;
                
                if (actionId === 'order_left' || actionId === 'order_right') {
                    const direction = actionId === 'order_left' ? -1 : 1;
                    const startSeat = ctx.getNextAliveSeat(ctx.sheriff.seat, direction);
                    
                    ctx.buildSpeakingQueue(startSeat, direction);
                    const dirStr = direction === 1 ? '順序' : '逆序';
                    Engine.EventBus.emit('MASTER_LOG', `【警長決定】由 ${startSeat} 號玩家開始${dirStr}發言`);
                    
                    self.sm.transitionTo('DAY_DISCUSSION');
                }
            },
            onTimeout: (ctx) => {
                // 超時防呆：預設從警長右手邊順序發言
                const startSeat = ctx.getNextAliveSeat(ctx.sheriff.seat, 1);
                ctx.buildSpeakingQueue(startSeat, 1);
                Engine.EventBus.emit('MASTER_LOG', `【系統超時】警長未指定，預設由 ${startSeat} 號玩家開始順序發言`);
                self.sm.transitionTo('DAY_DISCUSSION');
            }
        });
        
        ctx.addFilter('VOTE_WEIGHT', (weight, args) => {
            if (args.voterSeat === ctx.sheriff.seat && !args.isSheriffPhase) return weight + 0.5;
            return weight;
        });

        stateMachine.registerPhase('NIGHT_ACTION', {
            onEnter: (ctx) => {
                ctx.expectedActionCount = 0;
                ctx.currentStepActions = [];
                ctx.wolfPreviews = {};
                
                const currentPhase = ctx.nightSequence[ctx.currentNightStepIndex];
                currentPhase.roles.forEach(roleObj => {
                    const plugin = RoleRegistry.plugins[roleObj.roleName];
                    roleObj.activePlayers.forEach(p => {
                        let canAct = plugin.hasAction ? plugin.hasAction(ctx, p.seatNumber) : true;
                        canAct = ctx.applyFilter('NIGHT_ACTION_PERMISSION', canAct, { context: ctx, player: p });
                        
                        if (canAct) {
                            ctx.expectedActionCount++;
                        }
                    });
                });
                
                ctx.systemLog = `正在等待【${currentPhase.phaseName}】行動...`;
                if (ctx.expectedActionCount <= 0) self.resolveNightStep(ctx);
                else self.sm.setTimer(ctx.dynamicNightDuration || 30000); 
            },
            onAction: (ctx, player, actionId, targets) => {
                if (ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber)) return;
                
                ctx.currentStepActions.push({ player, targets, actionId });
                ctx.expectedActionCount--;
                if (ctx.expectedActionCount <= 0) self.resolveNightStep(ctx);
            },
            onTimeout: (ctx) => self.resolveNightStep(ctx)
        });
        stateMachine.registerPhase('MIDNIGHT_RESULT_DISPLAY', {
            onEnter: (ctx) => {
                self.sm.setTimer(3000); 
            },
            onTimeout: (ctx) => {
                Engine.EventBus.emit('ADVANCE_NIGHT_STEP');
            }
        });
        stateMachine.registerPhase('SHERIFF_CANDIDACY', {
            onEnter: (ctx) => {
                ctx.sheriff.candidates = [];
                ctx.sheriff.withdrawn = [];
                ctx.currentStepActions = []; 
                ctx.expectedActionCount = ctx.getAlivePlayers().length;
                ctx.systemLog = "正在登記警長競選...";
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId) => {
                if (ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber)) return;
                ctx.currentStepActions.push({ player, actionId });
                ctx.expectedActionCount--;
                if (actionId === 'run') ctx.sheriff.candidates.push(player.seatNumber);
                if (ctx.expectedActionCount <= 0) self.resolveSheriffCandidacy(ctx);
            },
            onTimeout: (ctx) => self.resolveSheriffCandidacy(ctx)
        });

        stateMachine.registerPhase('SHERIFF_RE_ELECTION_BAILOUT', {
            onEnter: (ctx) => {
                ctx.sheriff.candidates = ctx.sheriff.candidates.filter(seat => {
                    const p = ctx.getPlayer(seat);
                    return p && !p.isDead;
                });
                
                if (ctx.sheriff.candidates.length === 0) {
                    ctx.sheriff.badgeLost = true;
                    ctx.systemLog = "參與競選的玩家均已死亡，警徽流失。";
                    self.sm.clearTimer();
                    Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
                } else if (ctx.sheriff.candidates.length === 1) {
                    ctx.sheriff.seat = ctx.sheriff.candidates[0];
                    ctx.systemLog = `僅剩 ${ctx.sheriff.seat} 號玩家參選，自動當選警長！`;
                    self.sm.clearTimer();
                    Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
                } else {
                    ctx.currentStepActions = [];
                    ctx.systemLog = "【延遲再選舉】退水時間...";
                    self.sm.setTimer(15000);
                }
            },
            onAction: () => {}, // 退水統一由 host.js 的 SHERIFF_BAILOUT 封包攔截
            onTimeout: () => self.sm.transitionTo('SHERIFF_VOTING')
        });

        const baseVotingLogic = {
            onEnter: (ctx) => {
                ctx.votes = {};
                self.sm.setTimer(30000);
            },
            onAction: (ctx, player, actionId, targets) => {
                // 1. 本人投票權限防呆
                if (player.data && player.data.cannotVote) return;
                if (ctx.votes[player.seatNumber] !== undefined) return;
                
                const isSheriff = ['SHERIFF_VOTING', 'SHERIFF_PK_VOTING'].includes(ctx.phase);
                const isDayPK = ctx.phase === 'DAY_PK_VOTING';
                const isSheriffPK = ctx.phase === 'SHERIFF_PK_VOTING';
                
                // 2. 特殊身分禁止投票過濾 (PK台、警上玩家)
                if (isDayPK && ctx.pkTargets.includes(player.seatNumber)) return;
                if (isSheriffPK && ctx.sheriff.pkTargets.includes(player.seatNumber)) return;
                // [修改] 警長首次投票才限制全體候選人與退水者，PK投票僅限制 pkTargets
                if (ctx.phase === 'SHERIFF_VOTING' && (ctx.sheriff.candidates.includes(player.seatNumber) || ctx.sheriff.withdrawn.includes(player.seatNumber))) return;

                ctx.votes[player.seatNumber] = (actionId === 'vote' && targets.length > 0) ? targets[0] : 'pass';

                // 3. 模組化動態計算：當前「真正具備投票權」的總存活人數
                const aliveCount = ctx.getAlivePlayers().filter(p => {
                    if (p.data && p.data.cannotVote) return false; // 白痴不計入
                    if (isDayPK && ctx.pkTargets.includes(p.seatNumber)) return false;
                    if (isSheriffPK && ctx.sheriff.pkTargets.includes(p.seatNumber)) return false;
                    // [修改] 同步解除 PK 投票時對於退水者的分母過濾
                    if (ctx.phase === 'SHERIFF_VOTING' && (ctx.sheriff.candidates.includes(p.seatNumber) || ctx.sheriff.withdrawn.includes(p.seatNumber))) return false;
                    return true;
                }).length;

                const votedCount = Object.keys(ctx.votes).length;
                ctx.systemLog = `投票進度：${votedCount} / ${aliveCount}`;
                if (votedCount >= aliveCount) self.resolveVoting(ctx);
            },
            onTimeout: (ctx) => self.resolveVoting(ctx)
        };
        stateMachine.registerPhase('DAY_VOTING', baseVotingLogic);
        stateMachine.registerPhase('DAY_PK_VOTING', baseVotingLogic); // 更名
        stateMachine.registerPhase('SHERIFF_VOTING', baseVotingLogic);
        stateMachine.registerPhase('SHERIFF_PK_VOTING', baseVotingLogic); // 新增

        stateMachine.registerPhase('SHERIFF_TRANSFER', {
            allowDeadAction: true, 
            onEnter: (ctx) => { 
                ctx.systemLog = "等待警長移交警徽..."; 
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.sheriff.seat) return;
                if (player.data) player.data.mustTransferBadge = false;

                if (actionId === 'transfer' && targets.length > 0) {
                    ctx.sheriff.seat = targets[0];
                    ctx.systemLog = `【警長傳承】前任警長將警徽交給了 ${ctx.sheriff.seat} 號玩家。`;
                } else {
                    ctx.sheriff.seat = null;
                    ctx.sheriff.badgeLost = true;
                    ctx.systemLog = `【警徽流失】前任警長選擇撕毀警徽。`;
                }
                Engine.EventBus.emit('MASTER_LOG', ctx.systemLog);
                
                // [核心修復] 避免以 undefined 覆寫變數，改為安全拼接，保留死訊與熊咆哮
                if (ctx.dayDiscussionPrompt) ctx.dayDiscussionPrompt += `\n${ctx.systemLog}`;
                else ctx.dayDiscussionPrompt = ctx.systemLog;
                
                Engine.EventBus.emit('RESUME_ROUTINE');
            },
            onTimeout: (ctx) => {
                const oldSheriff = ctx.getPlayer(ctx.sheriff.seat);
                if (oldSheriff && oldSheriff.data) oldSheriff.data.mustTransferBadge = false;

                ctx.sheriff.seat = null;
                ctx.sheriff.badgeLost = true;
                ctx.systemLog = `【警徽流失】超時未動作，警徽強制流失。`;
                Engine.EventBus.emit('MASTER_LOG', ctx.systemLog);
                if (ctx.dayDiscussionPrompt) ctx.dayDiscussionPrompt += `\n${ctx.systemLog}`;
                else ctx.dayDiscussionPrompt = ctx.systemLog;
                
                Engine.EventBus.emit('RESUME_ROUTINE');
            }
        });

    stateMachine.registerPhase('HUNTER_ACTION', {
            allowDeadAction: true, 
            onEnter: (ctx) => { 
                ctx.systemLog = "等待獵人開槍 (15秒)..."; 
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.activeShooter) return; 
                
                const target = targets.length > 0 ? targets[0] : null;
                if (actionId === 'shoot' && target) {
                    const tPlayer = ctx.getPlayer(target);
                    if (tPlayer) tPlayer.kill('shot', ctx); 
                    const msg = `${player.seatNumber}號玩家發動技能擊殺了${target}號玩家`;
                    ctx.systemLog = msg;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', msg);
                    if (ctx.lastWordsTargets && ctx.lastWordsTargets.includes(player.seatNumber)) {
                        ctx.daySkillLastWordsQueue = [target];
                    }
                } else {
                    ctx.systemLog = `獵人選擇不開槍/無技能。`;
                }
                
                ctx.activeShooter = null; 
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            },
            onTimeout: (ctx) => {
                ctx.systemLog = `獵人超時未動作，視為放棄開槍 (悶槍)。`;
                ctx.activeShooter = null;
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            }
        });
        
        stateMachine.registerPhase('WOLFKING_ACTION', {
            allowDeadAction: true, 
            onEnter: (ctx) => { 
                ctx.systemLog = "等待狼王開槍 (15秒)..."; 
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.activeShooter) return; 
                
                const target = targets.length > 0 ? targets[0] : null;
                if (actionId === 'shoot' && target) {
                    const tPlayer = ctx.getPlayer(target);
                    if (tPlayer) tPlayer.kill('shot', ctx); 
                    const msg = `${player.seatNumber}號玩家發動技能擊殺了${target}號玩家`;
                    ctx.systemLog = msg;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', msg);
                    if (ctx.lastWordsTargets && ctx.lastWordsTargets.includes(player.seatNumber)) {
                        ctx.daySkillLastWordsQueue = [target];
                    }
                } else {
                    ctx.systemLog = `狼王選擇不開槍。`;
                }
                
                ctx.activeShooter = null; 
                
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            },
            onTimeout: (ctx) => {
                ctx.systemLog = `狼王超時未動作，視為放棄開槍。`;
                ctx.activeShooter = null;
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            }
        });
        stateMachine.registerPhase('BLOODMOON_ACTION', {
            allowDeadAction: true,
            onEnter: (ctx) => {
                ctx.systemLog = "等待血月使徒進行最後追擊 (15秒)...";
                self.sm.setTimer(15000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.activeShooter) return;

                const target = targets.length > 0 ? targets[0] : null;
                if (actionId === 'shoot' && target) {
                    const tPlayer = ctx.getPlayer(target);
                    if (tPlayer) tPlayer.kill('shot', ctx);
                    const msg = `${player.seatNumber}號玩家(血月使徒)發動最後技能擊殺了${target}號玩家`;
                    ctx.systemLog = msg;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', msg);
                } else {
                    ctx.systemLog = `血月使徒選擇放棄追擊。`;
                }

                ctx.activeShooter = null;
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            },
            onTimeout: (ctx) => {
                ctx.systemLog = `血月使徒超時未動作，視為放棄追擊。`;
                ctx.activeShooter = null;
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            }
        });
    },

    resolveNightStep: function(ctx) {
        if (ctx.isResolvingNightStep) return; 
        ctx.isResolvingNightStep = true;
        
        this.sm.clearTimer();
        const currentPhase = ctx.nightSequence[ctx.currentNightStepIndex];
        let phaseLog = `【${currentPhase.phaseName}】結算完畢：`;
        
        currentPhase.roles.forEach(roleObj => {
            const plugin = RoleRegistry.plugins[roleObj.roleName];
            const roleActions = ctx.currentStepActions.filter(act => {
                if (act.player.role === roleObj.roleName) return true;
                if (act.player.data && act.player.data.virtualRoles && act.player.data.virtualRoles.includes(roleObj.roleName)) return true;
                return false;
            });
            
            let result = "【未定義】";
            if (plugin && typeof plugin.resolveNightAction === 'function') {
                try {
                    result = plugin.resolveNightAction(ctx, roleActions);
                } catch (error) {
                    console.error(`[Engine] ${roleObj.roleName} 結算異常:`, error);
                    result = "因超時或例外錯誤，視為無動作。";
                }
            }
            
            roleObj.resultLog = result;
            phaseLog += `\n- ${roleObj.roleName}：${result}`;
        });
        
        ctx.systemLog = phaseLog;
        Engine.EventBus.emit('MASTER_LOG', phaseLog);
        Engine.EventBus.emit('SYNC_STATE');
        
        setTimeout(() => {
            ctx.isResolvingNightStep = false;
            Engine.EventBus.emit('NIGHT_STEP_COMPLETE');
        }, 3000); 
    },

    resolveSheriffCandidacy: function(ctx) {
        this.sm.clearTimer();
        const aliveCount = ctx.getAlivePlayers().length;
        
        ctx.getAlivePlayers().forEach(p => {
            if (!ctx.currentStepActions.some(act => act.player.seatNumber === p.seatNumber)) {
                ctx.currentStepActions.push({ player: p, actionId: 'pass' });
            }
        });

        if (ctx.sheriff.candidates.length === 0 || ctx.sheriff.candidates.length === aliveCount) {
            ctx.sheriff.badgeLost = true;
            ctx.sheriff.electionFinishedToday = true;
            ctx.systemLog = `由於全體上警/無人上警，本局警徽流失。`;
            Engine.EventBus.emit('MASTER_LOG', ctx.systemLog); // [新增] 將結果寫入全知紀錄
            Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
        } else if (ctx.sheriff.candidates.length === 1) {
            // [新增] 單人上警，自動當選
            ctx.sheriff.seat = ctx.sheriff.candidates[0];
            ctx.sheriff.electionFinishedToday = true;
            ctx.systemLog = `僅 ${ctx.sheriff.seat} 號玩家上警，自動當選警長！`;
            Engine.EventBus.emit('MASTER_LOG', ctx.systemLog); // [新增] 將結果寫入全知紀錄
            Engine.EventBus.emit('TRIGGER_DEATH_ANNOUNCE');
        } else {
            ctx.sheriff.candidates.sort((a,b) => a-b);
            const startSeat = ctx.sheriff.candidates[Math.floor(Math.random() * ctx.sheriff.candidates.length)];
            const dirNum = Math.random() < 0.5 ? 1 : -1;
            const direction = dirNum === 1 ? '順' : '逆';
            
            // [新增] 呼叫引擎建構上警發言佇列
            ctx.buildSpeakingQueue(startSeat, dirNum, ctx.sheriff.candidates);
            
            ctx.sheriffSpeechPrompt = `現在開始競選警長\n請由 ${startSeat} 號開始${direction}序發言`;
            ctx.systemLog = `上警名單：${ctx.sheriff.candidates.join('、')} 號。\n${ctx.sheriffSpeechPrompt}`;
            this.sm.transitionTo('SHERIFF_SPEECH');
        }
    },

    resolveVoting: function(ctx) {
        this.sm.clearTimer();
        const phase = ctx.phase;
        const isSheriff = ['SHERIFF_VOTING', 'SHERIFF_PK_VOTING'].includes(phase);
        if (!isSheriff) ctx.votedOutToday = null;
        
        ctx.getAlivePlayers().forEach(p => {
            if (p.data && p.data.cannotVote) return;
            if (phase === 'DAY_PK_VOTING' && ctx.pkTargets.includes(p.seatNumber)) return;
            if (phase === 'SHERIFF_PK_VOTING' && ctx.sheriff.pkTargets.includes(p.seatNumber)) return;
            // [修改] 若超時未投，警長首次投票才強制替退水者補入 pass（因為 PK 投票時他們具備權利）
            if (phase === 'SHERIFF_VOTING' && (ctx.sheriff.candidates.includes(p.seatNumber) || ctx.sheriff.withdrawn.includes(p.seatNumber))) return;
            if (ctx.votes[p.seatNumber] === undefined) ctx.votes[p.seatNumber] = 'pass';
        });

        let voteCounts = {};
        let voteGroups = {}; 
        let validVotesCount = 0;

        Object.entries(ctx.votes).forEach(([voterSeatStr, t]) => {
            const voterSeat = parseInt(voterSeatStr);
            if (!voteGroups[t]) voteGroups[t] = [];
            const voteWeight = (t !== 'pass') ? ctx.applyFilter('VOTE_WEIGHT', 1, { voterSeat, isSheriffPhase: isSheriff }) : 0;  
            voteGroups[t].push(voteWeight === 1.5 ? `${voterSeat}(1.5票)*` : `${voterSeat}`);
            if (t !== 'pass') {
                voteCounts[t] = (voteCounts[t] || 0) + voteWeight;
                validVotesCount++;
                if (!isSheriff) {
                    ctx.dailyVotes = ctx.dailyVotes || {};
                    ctx.dailyVotes[t] = ctx.dailyVotes[t] || [];
                    if (!ctx.dailyVotes[t].includes(voterSeat)) {
                        ctx.dailyVotes[t].push(voterSeat);
                    }
                }
            }
        });

        if (!isSheriff && ctx.cursedSeat) {
            const t = ctx.cursedSeat;
            const isEligible = (phase === 'DAY_PK_VOTING') ? ctx.pkTargets.includes(t) : ctx.getAlivePlayers().some(p => p.seatNumber === t);
            if (isEligible) {
                if (!voteGroups[t]) voteGroups[t] = [];
                voteGroups[t].push(`咒詛`);
                voteCounts[t] = (voteCounts[t] || 0) + 1;
                validVotesCount++;
            }
        }

        let maxVotes = 0;
        let finalTarget = null;
        let isTie = false;

        for (const [t, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) { maxVotes = count; finalTarget = parseInt(t); isTie = false; }
            else if (count === maxVotes) { isTie = true; }
        }
        if (validVotesCount === 0) { isTie = true; finalTarget = null; }

        let resultLines = [];
        for (const [target, voters] of Object.entries(voteGroups)) {
            const targetName = target === 'pass' ? '棄票' : `${target}號`;
            resultLines.push(`。${voters.join('、')} → ${targetName}`);
        }

        // ================= 1. 警長首次投票 =================
        if (phase === 'SHERIFF_VOTING') {
            if (isTie) {
                ctx.sheriff.pkTargets = [];
                for (const [t, count] of Object.entries(voteCounts)) {
                    if (count === maxVotes) ctx.sheriff.pkTargets.push(parseInt(t));
                }
                // [新增] 建立警長 PK 佇列 (起點隨機，依序發言)
                const startPK = ctx.sheriff.pkTargets[Math.floor(Math.random() * ctx.sheriff.pkTargets.length)];
                ctx.buildSpeakingQueue(startPK, 1, ctx.sheriff.pkTargets);
                
                ctx.currentVoteResultString = `【平票發生】\n${resultLines.join('\n')}\n\n準備進入警長 PK 發言。`;
                ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(警長首次投票)\n${ctx.currentVoteResultString}`);
                // [新增] 全知紀錄
                Engine.EventBus.emit('MASTER_LOG', `【投票結算】(警長首次投票) 第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                ctx.nextPhaseAfterVoteDisplay = 'SHERIFF_PK_SPEECH';
            } else {
                ctx.sheriff.seat = finalTarget;
                ctx.currentVoteResultString = `【警長誕生】\n${resultLines.join('\n')}\n\n恭喜 ${finalTarget} 號當選警長。`;
                ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(警長選舉)\n${ctx.currentVoteResultString}`);
                // [新增] 全知紀錄
                Engine.EventBus.emit('MASTER_LOG', `【投票結算】(警長選舉) 第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                ctx.nextPhaseAfterVoteDisplay = 'DAWN_RESUME';
            }
            ctx.postVoteSkillPhasePending = false;
            this.sm.transitionTo('VOTE_RESULT_DISPLAY');
            return;
        }

        // ================= 2. 警長對決投票 (延遲判定) =================
        if (phase === 'SHERIFF_PK_VOTING') {
            if (isTie) {
                ctx.sheriff.tieDelayCount++;
                if (ctx.sheriff.tieDelayCount >= 2) {
                    ctx.sheriff.badgeLost = true;
                    ctx.currentVoteResultString = `【再次平票】\n${resultLines.join('\n')}\n\n累積平票達上限，警徽流失。`;
                } else {
                    ctx.sheriff.isDelayedElection = true;
                    ctx.currentVoteResultString = `【再次平票】\n${resultLines.join('\n')}\n\n本日無法產生警長，選舉延後至明日。`;
                }
                ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(警長對決投票)\n${ctx.currentVoteResultString}`);
                // [新增] 全知紀錄
                Engine.EventBus.emit('MASTER_LOG', `【投票結算】(警長對決投票) 第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                ctx.nextPhaseAfterVoteDisplay = 'DAWN_RESUME';
            } else {
                ctx.sheriff.seat = finalTarget;
                ctx.currentVoteResultString = `【警長誕生】\n${resultLines.join('\n')}\n\n恭喜 ${finalTarget} 號當選警長。`;
                ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(警長對決投票)\n${ctx.currentVoteResultString}`);
                // [新增] 全知紀錄
                Engine.EventBus.emit('MASTER_LOG', `【投票結算】(警長對決投票) 第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                ctx.nextPhaseAfterVoteDisplay = 'DAWN_RESUME';
            }
            ctx.postVoteSkillPhasePending = false;
            this.sm.transitionTo('VOTE_RESULT_DISPLAY');
            return;
        }

        // ================= 3. 放逐首次投票 =================
        if (phase === 'DAY_VOTING') {
            if (isTie && validVotesCount > 0 && ctx.rules.tieResolution === 'pk' && !ctx.isPK) {
                ctx.isPK = true;
                ctx.pkTargets = [];
                for (const [t, count] of Object.entries(voteCounts)) {
                    if (count === maxVotes) ctx.pkTargets.push(parseInt(t));
                }
                // [新增] 建立放逐 PK 佇列
                const startPK = ctx.pkTargets[Math.floor(Math.random() * ctx.pkTargets.length)];
                ctx.buildSpeakingQueue(startPK, 1, ctx.pkTargets);
                
                ctx.currentVoteResultString = `【平票發生】\n${resultLines.join('\n')}\n\n準備進入放逐 PK 發言。`;
                ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(放逐首次投票)\n${ctx.currentVoteResultString}`);
                // [新增] 全知紀錄
                Engine.EventBus.emit('MASTER_LOG', `【投票結算】(放逐首次投票) 第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                ctx.nextPhaseAfterVoteDisplay = 'DAY_PK_SPEECH';
                ctx.postVoteSkillPhasePending = false;
                this.sm.transitionTo('VOTE_RESULT_DISPLAY');
                return; 
            }
        }

        // ================= 4. 常規放逐與放逐PK結算 =================
        ctx.isPK = false;
        ctx.pkTargets = [];
        let header = isTie ? "投票結果出爐，平票或全數棄票，無人出局" : `投票結果出爐，${finalTarget} 號玩家出局`;

        ctx.pendingHunter = null;
        ctx.lastWordsTargets = [];

        if (!isTie && finalTarget) {
            const tPlayer = ctx.getPlayer(finalTarget);
            
            if (!ctx.exiledHistory) ctx.exiledHistory = [];
            ctx.exiledHistory.push(finalTarget);
            
            const plugin = RoleRegistry.plugins[tPlayer.role];
            if (plugin && typeof plugin.onVotedOut === 'function') {
                const hookResult = plugin.onVotedOut(ctx, tPlayer);
                if (hookResult && hookResult.prevented) {
                    header = hookResult.logMessage || `投票結果出爐，${finalTarget} 號玩家免除出局`;
                    ctx.currentVoteResultString = `${header}\n${resultLines.join('\n')}`;
                    ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】\n${ctx.currentVoteResultString}`);
                    Engine.EventBus.emit('MASTER_LOG', `【投票結算】第 ${ctx.nightCount} 天\n${ctx.currentVoteResultString}`);
                    ctx.systemLog = header.replace('\n', '');
                    
                    ctx.destinationPhase = 'NIGHT_TRANSITION';
                    if (ctx.sheriff.seat === finalTarget && hookResult.transferSheriff) {
                        ctx.nextPhaseAfterVoteDisplay = 'SHERIFF_TRANSFER';
                    } else {
                        ctx.nextPhaseAfterVoteDisplay = 'RESUME_ROUTINE';
                    }
                    
                    this.sm.transitionTo('VOTE_RESULT_DISPLAY');
                    return; 
                }
            }

            tPlayer.kill('voted', ctx); 
            ctx.lastWordsTargets = [finalTarget];
            ctx.votedOutToday = finalTarget;
            ctx.buildSpeakingQueue(finalTarget, 1, ctx.lastWordsTargets);
        }
        
        ctx.currentVoteResultString = `${header}\n${resultLines.join('\n')}`;
        ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】\n${ctx.currentVoteResultString}`);
        ctx.systemLog = header.replace('\n', '');
        
        ctx.postVoteSkillPhasePending = true;
        Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
        if (ctx.phase !== 'GAME_OVER') {
            ctx.destinationPhase = 'NIGHT_TRANSITION';
            ctx.nextPhaseAfterVoteDisplay = 'RESUME_ROUTINE';
            this.sm.transitionTo('VOTE_RESULT_DISPLAY'); 
        }
    },

    resolveInterruptSkill: function(ctx) {
        this.sm.clearTimer();
        const initiator = ctx.getPlayer(ctx.interruptInitiator);
        
        if (initiator && RoleRegistry.plugins[initiator.role] && typeof RoleRegistry.plugins[initiator.role].resolveInterruptAction === 'function') {
            RoleRegistry.plugins[initiator.role].resolveInterruptAction(ctx, ctx.currentStepActions);
        } else {
            ctx.systemLog = `玩家未發動技能。`;
            Engine.EventBus.emit('MASTER_LOG', ctx.systemLog);
        }

        const deathMap = ctx.pendingDawnDeaths || {};
        const deadBefore = ctx.players.filter(p => p.isDead).map(p => p.seatNumber);

        ctx.players.forEach(p => {
            if (!p.isDead && deathMap[p.seatNumber]) p.kill(deathMap[p.seatNumber], ctx);
        });

        ctx.deadThisNight = ctx.players
            .filter(p => p.isDead && !deadBefore.includes(p.seatNumber))
            .map(p => p.seatNumber);

        ctx.pendingDawnDeaths = null;
        ctx.interruptInitiator = null;

        Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
        if (ctx.phase === 'GAME_OVER') return;

        const dead = ctx.deadThisNight;
        const msg = dead.length > 0 ? `剛剛結算，${dead.join(' 號、')} 號玩家死亡。` : `剛剛結算，無人死亡。`;
        ctx.deathAnnounceText = msg;
        ctx.systemLog = msg;
        Engine.EventBus.emit('BROADCAST_MESSAGE', msg);

        this.sm.transitionTo('DELAYED_DEATH_ANNOUNCE');
    }
};
