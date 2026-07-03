// ==========================================
// v4.0.3 遊戲階段模組 (Phase State Handlers)
// 檔案位置: js/phases.js
// ==========================================

window.PhaseRegistry = {
    sm: null, 
    
    init: function(stateMachine, ctx) {
        this.sm = stateMachine;
        const self = this; 
        
        const dummyPhase = { onEnter: () => {} };
        stateMachine.registerPhase('DAY_DISCUSSION', dummyPhase);
        stateMachine.registerPhase('SHERIFF_SPEECH', dummyPhase);
        stateMachine.registerPhase('LAST_WORDS', dummyPhase);
        stateMachine.registerPhase('VOTE_RESULT_DISPLAY', dummyPhase);
        
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
                else self.sm.setTimer(30000); 
            },
            onAction: (ctx, player, actionId, targets) => {
                if (ctx.currentStepActions.some(act => act.player.seatNumber === player.seatNumber)) return;
                
                ctx.currentStepActions.push({ player, targets, actionId });
                ctx.expectedActionCount--;
                if (ctx.expectedActionCount <= 0) self.resolveNightStep(ctx);
            },
            onTimeout: (ctx) => self.resolveNightStep(ctx)
        });

        stateMachine.registerPhase('SHERIFF_CANDIDACY', {
            onEnter: (ctx) => {
                ctx.sheriff.candidates = [];
                ctx.sheriff.withdrawn = [];
                ctx.currentStepActions = []; 
                ctx.expectedActionCount = ctx.getAlivePlayers().length;
                ctx.systemLog = "正在等待玩家決定是否上警...";
                self.sm.setTimer(30000);
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

        const baseVotingLogic = {
            onEnter: (ctx) => {
                ctx.votes = {};
                self.sm.setTimer(30000);
            },
            onAction: (ctx, player, actionId, targets) => {
                if (ctx.votes[player.seatNumber] !== undefined) return;
                
                const isPK = ctx.phase === 'PK_VOTING';
                const isSheriff = ctx.phase === 'SHERIFF_VOTING';
                
                if (isPK && ctx.pkTargets.includes(player.seatNumber)) return;
                if (isSheriff && (ctx.sheriff.candidates.includes(player.seatNumber) || ctx.sheriff.withdrawn.includes(player.seatNumber))) return;

                ctx.votes[player.seatNumber] = (actionId === 'vote' && targets.length > 0) ? targets[0] : 'pass';

                const aliveCount = ctx.getAlivePlayers().filter(p => {
                    if (isPK && ctx.pkTargets.includes(p.seatNumber)) return false;
                    if (isSheriff && (ctx.sheriff.candidates.includes(p.seatNumber) || ctx.sheriff.withdrawn.includes(p.seatNumber))) return false;
                    return true;
                }).length;

                const votedCount = Object.keys(ctx.votes).length;
                ctx.systemLog = `投票進度：${votedCount} / ${aliveCount}`;
                if (votedCount >= aliveCount) self.resolveVoting(ctx);
            },
            onTimeout: (ctx) => self.resolveVoting(ctx)
        };
        stateMachine.registerPhase('DAY_VOTING', baseVotingLogic);
        stateMachine.registerPhase('PK_VOTING', baseVotingLogic);
        stateMachine.registerPhase('SHERIFF_VOTING', baseVotingLogic);

        stateMachine.registerPhase('SHERIFF_TRANSFER', {
            allowDeadAction: true, // [新增] 宣告此階段允許死者送出動作
            onEnter: (ctx) => { ctx.systemLog = "等待警長移交或撕毀警徽..."; },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.sheriff.seat) return;
                
                if (actionId === 'transfer' && targets.length > 0) {
                    ctx.sheriff.seat = targets[0];
                    ctx.systemLog = `【警長傳承】前任警長將警徽交給了 ${ctx.sheriff.seat} 號玩家。`;
                } else {
                    ctx.sheriff.seat = null;
                    ctx.sheriff.badgeLost = true;
                    ctx.systemLog = `【警徽流失】前任警長選擇撕毀警徽。`;
                }
                
                Engine.EventBus.emit('RESUME_ROUTINE');
            }
        });

stateMachine.registerPhase('HUNTER_ACTION', {
            allowDeadAction: true, 
            onEnter: (ctx) => { ctx.systemLog = "等待獵人開槍..."; },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.activeShooter) return; // [修正] 安全鎖：不相干的人亂點按鈕直接無視
                
                const target = targets.length > 0 ? targets[0] : null;
                if (actionId === 'shoot' && target) {
                    const tPlayer = ctx.getPlayer(target);
                    if (tPlayer) tPlayer.kill('shot', ctx); 
                    ctx.systemLog = `獵人開槍帶走了 ${target} 號玩家。`;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', `【突發事件】一聲槍響，${target} 號玩家被帶走。`);
                } else {
                    ctx.systemLog = `獵人選擇不開槍/無技能。`;
                }
                
                ctx.activeShooter = null; // [新增] 開槍完畢，解除鎖定
                
                // [關鍵修正] 開槍殺人後，必須立刻檢查遊戲是否達到屠邊條件！
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            }
        });
        
        stateMachine.registerPhase('WOLFKING_ACTION', {
            allowDeadAction: true, 
            onEnter: (ctx) => { ctx.systemLog = "等待狼王開槍..."; },
            onAction: (ctx, player, actionId, targets) => {
                if (player.seatNumber !== ctx.activeShooter) return; // [修正] 安全鎖：不相干的人亂點按鈕直接無視
                
                const target = targets.length > 0 ? targets[0] : null;
                if (actionId === 'shoot' && target) {
                    const tPlayer = ctx.getPlayer(target);
                    if (tPlayer) tPlayer.kill('shot', ctx); 
                    ctx.systemLog = `狼王開槍帶走了 ${target} 號玩家。`;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', `【突發事件】一聲槍響，${target} 號玩家被帶走。`);
                } else {
                    ctx.systemLog = `狼王選擇不開槍。`;
                }
                
                ctx.activeShooter = null; // [新增] 開槍完畢，解除鎖定
                
                // [關鍵修正] 開槍殺人後，必須立刻檢查遊戲是否達到屠邊條件！
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                if (ctx.phase !== 'GAME_OVER') {
                    Engine.EventBus.emit('RESUME_ROUTINE');
                }
            }
        });
    },

    resolveNightStep: function(ctx) {
        this.sm.clearTimer();
        const currentPhase = ctx.nightSequence[ctx.currentNightStepIndex];
        let phaseLog = `【${currentPhase.phaseName}】結算完畢：`;
        
        currentPhase.roles.forEach(roleObj => {
            const plugin = RoleRegistry.plugins[roleObj.roleName];
            const roleActions = ctx.currentStepActions.filter(act => act.player.role === roleObj.roleName);
            const result = plugin ? plugin.resolveNightAction(ctx, roleActions) : "【未定義】";
            roleObj.resultLog = result;
            phaseLog += `\n- ${roleObj.roleName}：${result}`;
        });
        
        ctx.systemLog = phaseLog;
        Engine.EventBus.emit('SYNC_STATE');
        setTimeout(() => Engine.EventBus.emit('NIGHT_STEP_COMPLETE'), 3000); 
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
            Engine.EventBus.emit('DAWN_ANNOUNCE');
        } else if (ctx.sheriff.candidates.length === 1) {
            // [新增] 單人上警，自動當選
            ctx.sheriff.seat = ctx.sheriff.candidates[0];
            ctx.sheriff.electionFinishedToday = true;
            ctx.systemLog = `僅 ${ctx.sheriff.seat} 號玩家上警，自動當選警長！`;
            Engine.EventBus.emit('DAWN_ANNOUNCE');
        } else {
            ctx.sheriff.candidates.sort((a,b) => a-b);
            ctx.systemLog = `上警名單：${ctx.sheriff.candidates.join('、')} 號。\n請競選者開始發言...`;
            this.sm.transitionTo('SHERIFF_SPEECH');
        }
    },

    resolveVoting: function(ctx) {
        this.sm.clearTimer();
        const isSheriff = ctx.phase === 'SHERIFF_VOTING';
        if (!isSheriff) ctx.votedOutToday = null;
        
        ctx.getAlivePlayers().forEach(p => {
            const isPK = ctx.phase === 'PK_VOTING';
            if (isPK && ctx.pkTargets.includes(p.seatNumber)) return;
            if (isSheriff && (ctx.sheriff.candidates.includes(p.seatNumber) || ctx.sheriff.withdrawn.includes(p.seatNumber))) return;
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
            }
        });

        const isPK = ctx.phase === 'PK_VOTING';
        if (!isSheriff && ctx.cursedSeat) {
            const t = ctx.cursedSeat;
            const isEligible = isPK ? ctx.pkTargets.includes(t) : ctx.getAlivePlayers().some(p => p.seatNumber === t);
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

        if (isSheriff) {
            ctx.sheriff.electionFinishedToday = true;
            if (isTie) {
                ctx.sheriff.electionDay++;
                if (ctx.sheriff.electionDay > 2) ctx.sheriff.badgeLost = true;
                ctx.currentVoteResultString = `【警長平票】\n${resultLines.join('\n')}\n\n本日無警長產生。`;
            } else {
                ctx.sheriff.seat = finalTarget;
                ctx.currentVoteResultString = `【警長誕生】\n${resultLines.join('\n')}\n\n恭喜 ${finalTarget} 號當選警長。`;
            }
            ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(警長選舉)\n${ctx.currentVoteResultString}`);
            ctx.nextPhaseAfterVoteDisplay = 'DAWN_RESUME';
            this.sm.transitionTo('VOTE_RESULT_DISPLAY');
            return;
        }

        if (isTie && validVotesCount > 0 && ctx.rules.tieResolution === 'pk' && !ctx.isPK) {
            ctx.isPK = true;
            ctx.pkTargets = [];
            for (const [t, count] of Object.entries(voteCounts)) {
                if (count === maxVotes) ctx.pkTargets.push(parseInt(t));
            }
            ctx.currentVoteResultString = `【平票發生】\n${resultLines.join('\n')}\n\n準備進入 PK 發言。`;
            ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】(首次投票)\n${ctx.currentVoteResultString}`);
            ctx.systemLog = `平票！即將進行 PK 發言。`;
            ctx.nextPhaseAfterVoteDisplay = 'PK_SPEECH';
            this.sm.transitionTo('VOTE_RESULT_DISPLAY');
            return; 
        }

        ctx.isPK = false;
        let header = isTie ? "投票結果出爐，平票或全數棄票，無人出局" : `投票結果出爐，${finalTarget} 號玩家出局`;

        ctx.pendingHunter = null;
        ctx.lastWordsTargets = [];

        if (!isTie && finalTarget) {
            const tPlayer = ctx.getPlayer(finalTarget);
            tPlayer.kill('voted', ctx); 
            ctx.lastWordsTargets = [finalTarget];
            ctx.votedOutToday = finalTarget;
        }
        
        ctx.currentVoteResultString = `${header}\n${resultLines.join('\n')}`;
        ctx.voteHistory.push(`【第 ${ctx.nightCount} 天】\n${ctx.currentVoteResultString}`);
        ctx.systemLog = header.replace('\n', '');
        
        Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
        if (ctx.phase !== 'GAME_OVER') {
            ctx.destinationPhase = 'NIGHT_TRANSITION';
            ctx.nextPhaseAfterVoteDisplay = 'RESUME_ROUTINE';
            this.sm.transitionTo('VOTE_RESULT_DISPLAY'); 
        }
    }
};
