// ==========================================
// v4.3.0 角色系統與被動技能插件 (Role Plugins)
// 檔案位置: js/role.js
// ==========================================

window.RoleRegistry = {
    plugins: {},
    register: function(roleName, config) { this.plugins[roleName] = config; },

    initPassives: function(ctx) {
        if (ctx) {
            // [新增] 核心輔助函式：查詢當前號碼是否被魔術師交換
            ctx.getActualTarget = function(seat) {
                if (this.magicianSwap) {
                    if (parseInt(seat) === this.magicianSwap[0]) return this.magicianSwap[1];
                    if (parseInt(seat) === this.magicianSwap[1]) return this.magicianSwap[0];
                }
                return parseInt(seat);
            };

            ctx.addFilter('DAWN_DEATH_EVALUATION', (calc) => {
                const sanitize = (arr) => (arr || []).map(x => parseInt(x));
                calc.killed = sanitize(calc.killed);
                calc.poisoned = sanitize(calc.poisoned);
                calc.saved = sanitize(calc.saved);
                calc.dreamed = sanitize(calc.dreamed);
                calc.guarded = sanitize(calc.guarded);
                calc.lastDreamed = sanitize(calc.lastDreamed);
                if (ctx.magicianSwap) {
                    const swapMap = (arr) => arr.map(seat => ctx.getActualTarget(seat));
                    calc.killed = swapMap(calc.killed);
                    calc.poisoned = swapMap(calc.poisoned);
                    calc.saved = swapMap(calc.saved);
                }

                let deathMap = {};
                let allTargets = new Set([...calc.killed, ...calc.poisoned, ...calc.dreamed]);

                allTargets.forEach(targetSeat => {
                    if (calc.poisoned.includes(targetSeat)) {
                        deathMap[targetSeat] = 'poisoned';
                        return; 
                    }
                    if (calc.killed.includes(targetSeat)) {
                        const isGuarded = calc.guarded.includes(targetSeat);
                        const isSaved = calc.saved.includes(targetSeat);
                        if ((isGuarded && isSaved) || (!isGuarded && !isSaved)) {
                            deathMap[targetSeat] = 'killed'; 
                        }
                    }
                });
                ctx.players.forEach(p => {
                    const plugin = RoleRegistry.plugins[p.role];
                    if (plugin && typeof plugin.onDawnDeathEvaluation === 'function') {
                        plugin.onDawnDeathEvaluation(ctx, p, calc, deathMap);
                    }
                    
                    if (p.data.virtualRoles) {
                        p.data.virtualRoles.forEach(vRole => {
                            const vPlugin = RoleRegistry.plugins[vRole];
                            if (vPlugin && typeof vPlugin.onDawnDeathEvaluation === 'function') {
                                vPlugin.onDawnDeathEvaluation(ctx, p, calc, deathMap);
                            }
                        });
                    }
                });

                return deathMap;
            });
            ctx.addFilter('NIGHT_ACTION_PERMISSION', (canAct, args) => {
                const feared = args.context.fearedSeat;
                if (feared === args.player.seatNumber) return false;
                return canAct;
            });
        }
        Engine.EventBus.on('START_NIGHT', () => {
            if (ctx) {
                ctx.magicianSwap = null; // 每晚重置魔術狀態
                // 確保魔術師排在前半夜首位發動
                const firstHalf = ctx.nightSequence.find(s => s.phaseId === 'first_half');
                if (firstHalf) {
                    firstHalf.roles.sort((a, b) => a.roleName === '魔術師' ? -1 : (b.roleName === '魔術師' ? 1 : 0));
                }
            }
            ctx.players.forEach(p => {
                const plugin = RoleRegistry.plugins[p.role];
                if (plugin && typeof plugin.onNightStart === 'function') {
                    plugin.onNightStart(ctx, p);
                }
            });
        });
        Engine.EventBus.on('PLAYER_DIED', ({ context, player, reason }) => {
            const canShootReasons = ['killed', 'voted', 'shot'];
            if (player.role === '獵人' && canShootReasons.includes(reason)) {
                context.pendingHunter = player.seatNumber; 
            }
            if (player.role === '狼王' && canShootReasons.includes(reason)) {
                context.pendingWolfKing = player.seatNumber;
            }
            if (player.role === '狼美人' && reason !== 'dueled') {
                if (context.charmedSeat) {
                    const target = context.getPlayer(context.charmedSeat);
                    if (target && !target.isDead) {
                        target.kill('charmed', context);
                    }
                }
            }
            if (player.role === '機械狼' && player.data.machineState === 1 && player.data.learnedRole === '獵人' && canShootReasons.includes(reason)) {
                context.pendingWolfKing = player.seatNumber; // 委託現有狼王開槍通道，避免重複建構 UI 邏輯
                player.data.machineState = 2;
            }
        });

        Engine.EventBus.on('WOLF_EXPLODE', ({ context, player }) => {
            if (!player || player.isDead || !RoleRegistry.plugins[player.role]?.canSelfExplode) return;

            player.kill('explode', context);
            player.isRevealed = true;

            if (context.sheriff.seat === player.seatNumber) {
                context.sheriff.badgeLost = true;
                context.sheriff.seat = null;
            }

            const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
            if (sheriffPhases.includes(context.phase)) {
                // [修復] 移除過時的 electionDay 邏輯，統一由 host.js 的封包處理器更新 isDelayedElection
                context.systemLog = `${player.seatNumber} 號玩家自爆\n警長選舉被中斷。`;
            } else {
                context.systemLog = `${player.seatNumber} 號玩家自爆\n天黑請閉眼。`;
            }

            Engine.EventBus.emit('CHECK_WIN_CONDITION', context);
            if (context.phase !== 'GAME_OVER') Engine.EventBus.emit('FORCE_ENTER_NIGHT', context);
        });
    }
};

RoleRegistry.register("狼人", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: "midnight",      
    actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或選擇跳過以空刀)",
    getSelectableSeats: (ctx, mySeat) => {
        return ctx.getAlivePlayers()
            .filter(p => !RoleRegistry.plugins[p.role]?.immuneToWolfBite)
            .map(p => p.seatNumber);
    },
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        if (ctx.nightTags.wolfKillResolvedThisTurn) return "已參與狼人陣營襲擊";
        if (ctx.nightTags.wolfTeamFeared) {
            ctx.nightTags.wolfKillResolvedThisTurn = true;
            return "【空刀】(狼隊遭受恐懼)";
        }

        const allWolfActions = ctx.currentStepActions.filter(act => ROLE_DICTIONARY[act.player.role]?.faction === 'wolf');
        let validTargets = allWolfActions.filter(act => act.actionId !== 'pass' && act.targets.length > 0).map(act => act.targets[0]);
        ctx.nightTags.wolfKillResolvedThisTurn = true; 
        if (validTargets.length === 0) return "空刀";
        const finalTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
        
        if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
        ctx.nightTags.killed.push(parseInt(finalTarget));
        
        return `襲擊: ${finalTarget}號`;
    }
});

RoleRegistry.register("女巫", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "dynamic_buttons",

    onNightStart: (ctx, player) => {
        if (ctx.witchState) {
            ctx.witchState.savedSeat = null;
        }
    },

    getPrompt: (ctx, mySeat) => {
        if (!ctx.witchState) ctx.witchState = {};
        if (ctx.witchState.antidoteUsed) return "解藥已經用盡。\n請選擇要發動的技能：";
        const victim = ctx.nightTags?.killed?.length > 0 ? ctx.nightTags.killed[0] : "無";
        let extraMsg = "";
        if (victim === mySeat) {
            if (ctx.rules.witchSave === 'never') extraMsg = "\n(規則：女巫全程不可自救)";
            if (ctx.rules.witchSave === 'first_night' && ctx.nightCount > 1) extraMsg = "\n(規則：女巫僅首夜可自救)";
        }
        return `昨晚被襲擊的是 ${victim} 號。${extraMsg}\n請選擇要發動的技能：`;
    },
    getSelectableSeats: (ctx) => {
        if (ctx.witchState?.antidoteUsed && ctx.witchState?.poisonUsed) return [];
        return ctx.getAlivePlayers().map(p => p.seatNumber);
    },
    getButtons: (ctx, mySeat) => {
        let btns = [];
        const victim = ctx.nightTags?.killed?.length > 0 ? ctx.nightTags.killed[0] : null;
        let canSave = !(ctx.witchState?.antidoteUsed);
        if (canSave && victim === mySeat) {
            if (ctx.rules.witchSave === 'never') canSave = false;
            if (ctx.rules.witchSave === 'first_night' && ctx.nightCount > 1) canSave = false;
        }
        if (canSave) btns.push({ id: 'save', text: '使用解藥', requiresTarget: false });
        if (!(ctx.witchState?.poisonUsed) && !(ctx.nightTags?.witchUsedSaveTonight)) btns.push({ id: 'poison', text: '使用毒藥', requiresTarget: true });
        btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
        return btns;
    },
    getPreSelectedTarget: (ctx) => (!(ctx.witchState?.antidoteUsed) && ctx.nightTags?.killed?.length > 0) ? ctx.nightTags.killed[0] : null,
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "跳過行動"; 
        if (!ctx.witchState) ctx.witchState = {};
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'save' && !ctx.witchState.antidoteUsed) {
            if (ctx.nightTags?.killed?.length > 0) {
                ctx.witchState.savedSeat = ctx.nightTags.killed[0]; 
                ctx.witchState.silverWater = ctx.nightTags.killed[0]; 
                ctx.nightTags.witchUsedSaveTonight = true;
                ctx.witchState.antidoteUsed = true;
                return "使用解藥";
            }
            return "使用解藥";
        } else if (act.actionId === 'poison' && !ctx.witchState.poisonUsed && !ctx.nightTags?.witchUsedSaveTonight) {
            if (!ctx.witchState.antidoteUsed && ctx.nightTags?.killed?.length > 0 && target === ctx.nightTags.killed[0]) {
                return "解藥尚未使用時，不可毒殺被襲擊者。";
            }
            if (target) {
                ctx.nightTags.poisoned.push(parseInt(target));
                ctx.witchState.poisonUsed = true;
                ctx.nightTags.poisonerSeat = act.player.seatNumber;
                return `毒殺${target}號玩家`;
            }
            return "跳過行動";
        }
        return "跳過行動";
    }
});

RoleRegistry.register("預言家", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    isSeer: true,
    getPrompt: () => "選擇今晚的查驗目標",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            // 優先讀取掩護身分 (供機械狼偽裝使用)
            const checkRole = tPlayer.data.camouflageRole || tPlayer.role; 
            
            // 預言家 / 燈影預言家 使用陣營判定：
            const isWolf = (checkRole && ROLE_DICTIONARY[checkRole]?.faction === 'wolf');
            let alignment = isWolf ? "狼人" : "好人";
            
            const pluginDef = RoleRegistry.plugins[tPlayer.role];
            if (pluginDef) {
                const isCamouflaged = typeof pluginDef.seenBySeerAsGood === 'function' 
                    ? pluginDef.seenBySeerAsGood(ctx, target) 
                    : pluginDef.seenBySeerAsGood;
                if (isCamouflaged) alignment = "好人";
            }
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = alignment; // (燈影為 fakeAlignment)
            act.player.data.latestCheckResult = { seat: parseInt(target), alignment: alignment, isSeerAction: true }; // (燈影為 fakeAlignment)
            act.player.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`; // (燈影為 fakeAlignment)
            return `查驗: ${target}號`;
        }
        return "跳過行動";
    }
});

RoleRegistry.register("燈影預言家", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    isSeer: true,
    getPrompt: () => "選擇今晚的查驗目標",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            // 優先讀取掩護身分 (供機械狼偽裝使用)
            const checkRole = tPlayer.data.camouflageRole || tPlayer.role; 
            
            // 預言家 / 燈影預言家 使用陣營判定：
            const isWolf = (checkRole && ROLE_DICTIONARY[checkRole]?.faction === 'wolf');
            let alignment = isWolf ? "狼人" : "好人";
            
            const pluginDef = RoleRegistry.plugins[tPlayer.role];
            if (pluginDef) {
                const isCamouflaged = typeof pluginDef.seenBySeerAsGood === 'function' 
                    ? pluginDef.seenBySeerAsGood(ctx, target) 
                    : pluginDef.seenBySeerAsGood;
                if (isCamouflaged) alignment = "好人"; 
            }
            let fakeAlignment = (alignment === "狼人") ? "好人" : "狼人";

            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = fakealignment; // (燈影為 fakeAlignment)
            // [修復] 強制轉為整數，並補上 isSeerAction 標記
            act.player.data.latestCheckResult = { seat: parseInt(target), alignment: fakealignment, isSeerAction: true }; // (燈影為 fakeAlignment)
            act.player.data.tempPrivateMessage = `${target}號玩家是【${fakealignment}】。`; // (燈影為 fakeAlignment)
            return `查驗: ${target}號`;
        }
        return "跳過行動";
    }
});

RoleRegistry.register("平民", { canSelfExplode: false });
RoleRegistry.register("獵人", { canSelfExplode: false });
RoleRegistry.register("白痴", { 
    canSelfExplode: false,
    onVotedOut: (ctx, player) => {
        if (!player.isRevealed) {
            player.isRevealed = true;
            player.data.cannotVote = true; 
            const isSheriff = (ctx.sheriff.seat === player.seatNumber);
            if (isSheriff) player.data.mustTransferBadge = true; 
            
            return {
                prevented: true,
                transferSheriff: isSheriff,
                logMessage: `投票結果出爐，${player.seatNumber} 號玩家為白痴！\n翻牌自證，免除本次放逐出局，但永久失去投票權。`
            };
        }
        return { prevented: false };
    }
});
RoleRegistry.register("狼王", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: "midnight",      
    actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或跳過以空刀)",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction
});

RoleRegistry.register("守衛", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    getPrompt: () => "選擇今晚守護的目標 (不可連續兩晚守護同一人)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().filter(p => p.seatNumber !== ctx.lastGuardedSeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'guard', text: '守護', requiresTarget: true }, { id: 'pass', text: '空守', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') {
            ctx.guardedSeat = null;
            ctx.lastGuardedSeat = null;
            return "【空守】";
        }
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        ctx.guardedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
        ctx.lastGuardedSeat = target;
        return `【守護: ${target}號】`;
    }
});

RoleRegistry.register("白狼王", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: "midnight", actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或跳過以空刀)",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction,
    daySkill: {
        id: 'wwk_explode', buttonText: '自爆並帶走', requiresTarget: true,
        allowedPhases: ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_ORDER_SELECTION', 'DAY_DISCUSSION', 'DAY_PK_SPEECH', 'LAST_WORDS'],
        getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
        resolve: (ctx, player, targetSeat) => {
            const targetPlayer = ctx.getPlayer(targetSeat);
            player.isRevealed = true;
            player.kill('explode', ctx);
            targetPlayer.kill('shot', ctx); 
            if (ctx.sheriff.seat === player.seatNumber) { ctx.sheriff.badgeLost = true; ctx.sheriff.seat = null; }
            
            const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
            if (sheriffPhases.includes(ctx.phase)) {
                // [修復] 同步寫入正規的延遲選舉狀態，取代過時的 electionDay
                ctx.sheriff.explodeDelayCount++;
                const maxExplode = ctx.rules.sheriffExplodeRule === 'double' ? 2 : 1;
                if (ctx.sheriff.explodeDelayCount >= maxExplode) {
                    ctx.sheriff.badgeLost = true;
                } else {
                    ctx.sheriff.isDelayedElection = true;
                }
            }

            ctx.systemLog = `${player.seatNumber} 號玩家是白狼王\n他擊殺了 ${targetSeat} 號玩家，天黑請閉眼。`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);

            Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            if (ctx.phase !== 'GAME_OVER') {
                ctx.destinationPhase = 'NIGHT_TRANSITION';
                Engine.EventBus.emit('RESUME_ROUTINE');
            }
        }
    }
});

RoleRegistry.register("騎士", {
    canSelfExplode: false,
    daySkill: {
        id: 'duel', buttonText: '發起決鬥', requiresTarget: true,
        allowedPhases: ['DAY_DISCUSSION', 'DAY_PK_SPEECH'],
        getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
        resolve: (ctx, player, targetSeat) => {
            const targetPlayer = ctx.getPlayer(targetSeat);
            player.isRevealed = true; // 騎士翻牌自證
            ctx.systemLog = `${player.seatNumber} 號玩家是騎士，向${targetSeat} 號玩家發起決鬥。`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            const isWolf = ROLE_DICTIONARY[targetPlayer.role]?.faction === 'wolf';
            if (isWolf) {
                targetPlayer.kill('dueled', ctx);
                const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
                if (sheriffPhases.includes(ctx.phase)) {
                    ctx.sheriff.explodeDelayCount++;
                    const maxExplode = ctx.rules.sheriffExplodeRule === 'double' ? 2 : 1;
                    if (ctx.sheriff.explodeDelayCount >= maxExplode) {
                        ctx.sheriff.badgeLost = true;
                    } else {
                        ctx.sheriff.isDelayedElection = true;
                    }
                }
                ctx.isResolvingAsync = true;
                setTimeout(() => {
                    ctx.isResolvingAsync = false;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', `決鬥結束，${targetSeat} 號玩家是狼人\n天黑請閉眼。`);
                    Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                    if (ctx.phase !== 'GAME_OVER') {
                        ctx.destinationPhase = 'NIGHT_TRANSITION'; 
                        Engine.EventBus.emit('RESUME_ROUTINE');
                    }
                }, 5000);
            } else {
                player.kill('dueled', ctx);
                setTimeout(() => {
                    ctx.isResolvingAsync = false;
                    Engine.EventBus.emit('BROADCAST_MESSAGE', `決鬥結束，${targetSeat} 號玩家是好人，決鬥失敗，請玩家繼續發言。`);
                    Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                    if (ctx.phase !== 'GAME_OVER') {
                        ctx.destinationPhase = ctx.phase; 
                        Engine.EventBus.emit('RESUME_ROUTINE'); 
                    }
                }, 5000);
            }
        }
    }
});

RoleRegistry.register("守墓人", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    onNightStart: (ctx, player) => {
        if (ctx.votedOutToday && !player.isDead) {
            const target = ctx.getPlayer(ctx.votedOutToday);
            const isWolf = ROLE_DICTIONARY[target.role]?.faction === 'wolf';
            const alignment = isWolf ? '狼人' : '好人';

            player.data.seerRecords = player.data.seerRecords || {};
            player.data.seerRecords[ctx.votedOutToday] = alignment;
            player.data.latestCheckResult = { seat: ctx.votedOutToday, alignment: alignment };
        }
    },
    getPrompt: (ctx) => {
        if (ctx.votedOutToday) {
            const target = ctx.getPlayer(ctx.votedOutToday);
            const isWolf = ROLE_DICTIONARY[target.role]?.faction === 'wolf';
            const alignment = isWolf ? '狼人' : '好人';

            return `昨日${ctx.votedOutToday} 號被放逐\n他是【${alignment}】。`;
        }
        return "昨日無人被放逐。";
    },
    getSelectableSeats: () => [],
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: false }],
    resolveNightAction: () => "確認資訊"
});

RoleRegistry.register("石像鬼", {
    canSelfExplode: false,
    canSeeWolves: false,
    seenAsWolf: false,
    isAttacker: false,    
    nightPhase: ["first_half", "midnight"], 
    actionType: "dynamic_buttons",
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return true;
        
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0; 
    },
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return "選擇今晚的揭示目標";
        return "已無其他狼人存活，請選擇襲擊目標。";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber); 
    },
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        return [{ id: 'kill', text: '襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "跳過行動";
        
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        const target = act.targets[0];
        
        if (step.phaseId === 'first_half' && act.actionId === 'check') {
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = tPlayer.role; 
            act.player.data.latestCheckResult = { seat: target, alignment: tPlayer.role };
            act.player.data.tempPrivateMessage = `${target}號玩家的身分是【${tPlayer.role}】。`;
            return `查驗: ${target}號`;
            
        } else if (step.phaseId === 'midnight' && act.actionId === 'kill') {
            if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
            ctx.nightTags.killed.push(parseInt(target));
            return `襲擊: ${target}號`;
        }
        return "跳過行動";
    }
});

RoleRegistry.register("隱狼", {
    canSelfExplode: false,
    canSeeWolves: true,
    seenAsWolf: false,
    isAttacker: false,
    onNightStart: (ctx, player) => {
        player.data.customTopTags = player.data.customTopTags || {};
        ctx.players.forEach(p => {
            if (p.seatNumber !== player.seatNumber) {
                const def = ROLE_DICTIONARY[p.role];
                if (def && def.faction === 'wolf') {
                    player.data.customTopTags[p.seatNumber] = p.role;
                }
            }
        });
    },
    seenBySeerAsGood: (ctx, mySeat) => {
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length > 0;
    },
    nightPhase: "midnight",      
    actionType: "single_select",
    hasAction: (ctx, mySeat) => {
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0; 
    },
    getPrompt: () => "狼同伴已全數陣亡，請選擇襲擊目標。",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: () => [{ id: 'kill', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【空刀】";
        
        const target = act.targets[0];
        if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
        ctx.nightTags.killed.push(parseInt(target));
        return `【襲擊: ${target}號】`;
    }
});

RoleRegistry.register("烏鴉", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    getPrompt: () => "選擇今晚詛咒的目標 (不可連續兩晚詛咒同一人)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().filter(p => p.seatNumber !== ctx.lastCursedSeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'curse', text: '詛咒', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') {
            ctx.cursedSeat = null;
            ctx.lastCursedSeat = null;
            return "【跳過行動】";
        }
        
        const target = act.targets[0];
        ctx.cursedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
        ctx.lastCursedSeat = target;
        return `【詛咒: ${target}號】`;
    }
});

RoleRegistry.register("噩夢之影", {
    canSelfExplode: true,
    canSeeWolves: false,
    seenAsWolf: true,
    immuneToWolfBite: true,
    hasWolfChatAccess: true,
    nightPhase: ["first_half", "midnight"], 
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half' ? 'single_select' : 'consensus',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    onNightStart: (ctx, player) => {
        if (ctx.nightCount > 1) {
            player.data.customTopTags = player.data.customTopTags || {};
            ctx.players.forEach(p => {
                if (RoleRegistry.plugins[p.role]?.seenAsWolf) {
                    player.data.customTopTags[p.seatNumber] = p.role;
                }
            });
        }
    },
    getPrompt: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half') return "選擇今晚恐懼的目標 (使其今晚無法行動)";
        return "選擇今晚的襲擊目標 (或跳過以空刀)";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers()
            .filter(p => p.seatNumber !== mySeat && p.seatNumber !== ctx.lastFearedSeat) 
            .map(p => p.seatNumber); 
    },
    getButtons: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half') {
            return [{ id: 'fear', text: '恐懼', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        }
        return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const phaseId = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        
        if (phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }
        const unlockWolfVision = () => {
            if (ctx.nightCount === 1) {
                ctx.players.forEach(p => {
                    if (p.role === '噩夢之影' && !p.isDead) {
                        p.data.customTopTags = p.data.customTopTags || {};
                        ctx.players.forEach(op => {
                            if (RoleRegistry.plugins[op.role]?.seenAsWolf) {
                                p.data.customTopTags[op.seatNumber] = op.role;
                            }
                        });
                    }
                });
            }
        };

        const act = actions[0];
        if (!act || act.actionId === 'pass') {
            unlockWolfVision(); 
            return "【跳過行動】";
        }
        
        if (phaseId === 'first_half' && act.actionId === 'fear') {
            const target = act.targets[0];
            ctx.fearedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target; 
            
            const tPlayer = ctx.getPlayer(ctx.fearedSeat);
            if (tPlayer) {
                const tPlugin = RoleRegistry.plugins[tPlayer.role];
                if (ROLE_DICTIONARY[tPlayer.role]?.faction === 'wolf' && !!tPlugin?.isAttacker) {
                    ctx.nightTags = ctx.nightTags || {};
                    ctx.nightTags.wolfTeamFeared = true;
                }
            }
            
            unlockWolfVision(); 
            return `【恐懼: ${target}號】`;
        }
    }
});

RoleRegistry.register("狼美人", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    immuneToWolfBite: true,
    hasWolfChatAccess: true,
    nightPhase: ["midnight", "second_half"], 
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    getPrompt: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') return "選擇今晚的襲擊目標 (或跳過以空刀)";
        return "選擇今晚的魅惑目標 (死亡時目標將會殉情)";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers()
            .filter(p => p.seatNumber !== mySeat && p.seatNumber !== ctx.lastCharmedSeat) 
            .map(p => p.seatNumber); 
    },
    getButtons: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        }
        return [{ id: 'charm', text: '魅惑', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const phaseId = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;

        if (phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }
        
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        if (phaseId === 'second_half' && act.actionId === 'charm') {
            const target = act.targets[0];
            ctx.charmedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            return `【魅惑: ${target}號】`;
        }
    }
});

RoleRegistry.register("攝夢人", {
    canSelfExplode: false,
    nightPhase: "second_half", 
    actionType: "single_select",
    getPrompt: () => "選擇今晚的攝夢目標 (不可選擇自己，不可跳過)",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'dream', text: '攝夢', requiresTarget: true }],
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.isDead) return;
        if (ctx.dreamedSeat) {
            const dSeat = ctx.dreamedSeat;
            if (deathMap[dSeat] === 'killed' || deathMap[dSeat] === 'poisoned') {
                delete deathMap[dSeat]; 
            }
        }       
        calc.dreamed.forEach(targetSeat => {
            if (calc.lastDreamed.includes(targetSeat)) deathMap[targetSeat] = 'doubledreamed';
        });
        if (deathMap[player.seatNumber] && ctx.dreamedSeat) {
            deathMap[ctx.dreamedSeat] = 'doubledreamed'; 
        }
    },
    resolveNightAction: (ctx, actions) => {
        let target;
        const act = actions.find(a => a.actionId !== 'pass');
        
        if (act && act.targets && act.targets.length > 0) {
            target = act.targets[0];
        } else {
            const swPlayer = ctx.players.find(p => p.role === '攝夢人' && !p.isDead);
            if (!swPlayer) return "【無效行動，隨機選擇】";
            
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== swPlayer.seatNumber).map(p => p.seatNumber);
            if (selectable.length > 0) {
                target = selectable[Math.floor(Math.random() * selectable.length)];
            }
        }
        
        if (target) {
            ctx.dreamedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
            return `【攝夢: ${target}號】`;
        }
        
        return "【行動失敗】";
    }
});

RoleRegistry.register("暗戀者", {
    faction: "good",
    type: "villager",      
    nightPhase: "first_half", 
    actionType: "single_select",
    getPrompt: (ctx) => (ctx.nightCount === 1 && !ctx.crushTarget) 
        ? "選擇你的暗戀對象 (僅首夜可使用，不可選擇自己)" 
        : "你已經有暗戀對象了，今晚好好休息。",
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightCount === 1 && !ctx.crushTarget) {
            return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
        }
        return [];
    },
    getButtons: (ctx) => {
        if (ctx.nightCount === 1 && !ctx.crushTarget) {
            return [{ id: 'crush', text: '暗戀', requiresTarget: true }];
        }
        return [{ id: 'pass', text: '確認', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions, mySeat) => {
        if (ctx.nightCount > 1 || ctx.crushTarget) return "【無效行動】";
        
        let target;
        const act = actions.find(a => a.actionId === 'crush');
        
        if (act && act.targets && act.targets.length > 0) {
            target = act.targets[0];
        } else {
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
            if (selectable.length > 0) target = selectable[Math.floor(Math.random() * selectable.length)];
        }
        
        if (target) {
            ctx.crushTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
            ctx.admirerSeat = mySeat; 
            return `【暗戀: ${target}號】`;
        }
        
        return "【行動失敗】";
    }
});

RoleRegistry.register("惡靈騎士", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    immuneToWolfBite: true, 
    nightPhase: "midnight",      
    actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標\n(或跳過以空刀)",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: RoleRegistry.plugins["狼人"].getButtons,
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.isDead) return;
        if (deathMap[player.seatNumber]) delete deathMap[player.seatNumber];

        if (!player.data.hasReflected) {
            let hasTriggeredThisNight = false;
            ctx.players.forEach(p => {
                if (!p.isDead && p.data.latestCheckResult) {
                    // [修復] 預言家的查驗紀錄為原始號碼(供UI顯示)，反傷判定必須動態轉換為實體座位
                    const checkedActual = ctx.getActualTarget ? ctx.getActualTarget(p.data.latestCheckResult.seat) : p.data.latestCheckResult.seat;
                    if (checkedActual === player.seatNumber) {
                        if (RoleRegistry.plugins[p.role]?.isSeer || p.data.latestCheckResult?.isSeerAction) { 
                            deathMap[p.seatNumber] = 'reflected'; 
                            ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：惡靈騎士反傷發動，擊殺 ${p.seatNumber} 號)`;
                            hasTriggeredThisNight = true;
                        }
                    }
                }
            });
            
            if (!hasTriggeredThisNight) {
                const poisonedList = calc.poisoned || [];
                if (poisonedList.includes(player.seatNumber)) {
                    const poisonerSeat = ctx.nightTags?.poisonerSeat;
                    if (poisonerSeat) {
                        deathMap[poisonerSeat] = 'reflected';
                        ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：惡靈騎士反傷發動，擊殺投毒者 ${poisonerSeat} 號)`;
                        hasTriggeredThisNight = true;
                    }
                }
            }
            if (hasTriggeredThisNight) player.data.hasReflected = true;
        }
    },
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction
});

RoleRegistry.register("魔鏡少女", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    isSeer: true, 
    getPrompt: () => "選擇今晚的查驗目標 (系統將顯示具體身分)",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [
        { id: 'confirm', text: '確認', requiresTarget: true }, 
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
            const act = actions[0];
            if (!act) return "【跳過行動】";
            const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
            
            if (act.actionId === 'confirm' && target) {
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
                const tPlayer = ctx.getPlayer(actualTarget);
                
                const exactRole = tPlayer.data.camouflageRole || tPlayer.role; 
                
                act.player.data.seerRecords = act.player.data.seerRecords || {};
                act.player.data.seerRecords[target] = exactRole;
                act.player.data.latestCheckResult = { seat: parseInt(target), alignment: exactRole, isSeerAction: true };
                act.player.data.tempPrivateMessage = `${target}號玩家的具體身分為【${exactRole}】。`;
                
                return `查驗: ${target}號`;
            }
            return "跳過行動";
        }
});

RoleRegistry.register("機械狼", {
    canSelfExplode: false,
    canSeeWolves: false, 
    seenAsWolf: false,
    nightPhase: ["first_half", "midnight", "second_half"],
    onNightStart: (ctx, player) => {
        player.data.learnedThisNight = false;
        player.data.mwGuardedSeat = null;
    },
    // [新增] 機械狼強化守護結算鉤子
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.data.mwGuardedSeat) {
            // 動態解析實體座位，相容魔術師換位邏輯
            const gSeat = ctx.getActualTarget ? ctx.getActualTarget(player.data.mwGuardedSeat) : player.data.mwGuardedSeat;
            
            // 1. 抵禦狼刀 (相容標準機制的同守同救與真假守衛衝突)
            if (calc.killed.includes(gSeat)) {
                if (calc.saved.includes(gSeat) || calc.guarded.includes(gSeat)) {
                    deathMap[gSeat] = 'killed'; 
                } else {
                    if (deathMap[gSeat] === 'killed') delete deathMap[gSeat];
                }
            }
            
            // 2. 抵禦毒藥 (強化守護特有邏輯)
            if (calc.poisoned.includes(gSeat)) {
                if (deathMap[gSeat] === 'poisoned') delete deathMap[gSeat];
            }
            
            player.data.mwGuardedSeat = null;
        }
    },
    isAttacker: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId !== 'midnight') return false;
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0;
    },
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        const state = p.data.machineState || 0;

        if (step === 'first_half') return state === 0; 
        if (step === 'midnight') {
            const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
            return otherWolves.length === 0;
        }
        if (step === 'second_half') {
            if (state === 1 && !p.data.learnedThisNight) {
                const role = p.data.learnedRole;
                if (['魔鏡少女', '預言家', '燈影預言家', '女巫', '守衛'].includes(role)) return true;
                if (role === '狼人') {
                    const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
                    return otherWolves.length === 0; 
                }
            }
        }
        return false;
    },
    actionType: (ctx) => ctx.nightSequence[ctx.currentNightStepIndex].phaseId === 'midnight' ? 'consensus' : 'single_select',
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "其餘狼人均已出局\n請選擇襲擊目標";
        if (step === 'first_half') return "選擇一名玩家進行學習\n（獲得其技能，並改變自己被查驗的結果）";
        
        const role = ctx.getPlayer(mySeat).data.learnedRole;
        if (['魔鏡少女', '預言家', '燈影預言家'].includes(role)) return `【技能: ${role}】選擇查驗目標`;
        if (role === '女巫') return "【技能: 毒藥】選擇毒殺目標";
        if (role === '守衛') return "【技能: 守護】選擇強化守護目標";
        if (role === '狼人') return "【技能: 雙刀】選擇額外襲擊目標";
        return "等待中...";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence[ctx.currentNightStepIndex].phaseId === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
    },
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return [{ id: 'kill', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        if (step === 'first_half') return [{ id: 'learn', text: '學習', requiresTarget: true }];
        
        const role = ctx.getPlayer(mySeat).data.learnedRole;
        if (['魔鏡少女', '預言家', '燈影預言家'].includes(role)) return [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        if (role === '女巫') return [{ id: 'poison', text: '毒殺', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        if (role === '守衛') return [{ id: 'guard', text: '強化守護', requiresTarget: true }, { id: 'pass', text: '空守', requiresTarget: false }];
        if (role === '狼人') return [{ id: 'kill', text: '額外襲擊', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        return [];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【無效行動】";
        const p = act.player;
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;

        if (step === 'midnight') {
            if (act.actionId === 'pass') return "【空刀】";
            const target = act.targets[0];
            if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
            ctx.nightTags.killed.push(parseInt(target));
            return `【襲擊: ${target}號】`;
        }

        if (act.actionId === 'pass') return "【跳過行動】";
        const target = act.targets[0];
        const state = p.data.machineState || 0;

        if (step === 'first_half' && state === 0 && act.actionId === 'learn') {
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            p.data.learnedRole = tPlayer.role;
            p.data.camouflageRole = tPlayer.role; 
            
            p.data.customTopTags = p.data.customTopTags || {};
            p.data.customTopTags[target] = tPlayer.role; 

            p.data.machineState = 1;              
            p.data.learnedThisNight = true;       
            return `【學習: ${target}號 (${tPlayer.role})】`;
        }

        if (step === 'second_half' && state === 1) {
            const role = p.data.learnedRole;
            
            if (act.actionId === 'check') {
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
                const tPlayer = ctx.getPlayer(actualTarget);
                const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
                const isWolf = (checkRole && ROLE_DICTIONARY[checkRole]?.faction === 'wolf');
                let alignment = isWolf ? "狼人" : "好人";
                
                if (role === '預言家' || role === '燈影預言家') {
                    const pluginDef = RoleRegistry.plugins[tPlayer.role];
                    if (pluginDef && pluginDef.seenBySeerAsGood) alignment = "好人";
                    if (role === '燈影預言家') alignment = (alignment === "狼人") ? "好人" : "狼人";
                } else if (role === '魔鏡少女') {
                    alignment = checkRole; 
                }

                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true }; 
                p.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
                p.data.machineState = 2; 
                return `【查驗: ${target}號】`;
            }
            
            if (act.actionId === 'poison') {
                if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
                ctx.nightTags.poisoned.push(parseInt(target));
                p.data.machineState = 2; 
                return `【毒殺: ${target}號】`;
            }
            
            if (act.actionId === 'guard') {
                p.data.mwGuardedSeat = parseInt(target); 
                return `【守護: ${target}號】`;
            }
            
            if (act.actionId === 'kill') {
                if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
                ctx.nightTags.killed.push(parseInt(target));
                p.data.machineState = 2; 
                return `【額外襲擊: ${target}號】`;
            }
        }
        return "【無效行動】";
    }
});

RoleRegistry.register("奇蹟商人", {
    canSelfExplode: false,
    nightPhase: "first_half",
    actionType: "single_select",
    onNightStart: (ctx, player) => {
        const luckyPlayers = ctx.getAlivePlayers().filter(p => p.data.grantedSkill && !p.data.grantedSkillUsed);
        if (luckyPlayers.length > 0) {
            let luckyPhase = ctx.nightSequence.find(seq => seq.phaseId === 'lucky_action');
            if (!luckyPhase) {
                ctx.nightSequence.push({
                    phaseId: 'lucky_action', phaseName: '幸運兒行動',
                    roles: [{ roleName: '幸運兒', roleDef: RoleRegistry.plugins['幸運兒'], activePlayers: luckyPlayers, resultLog: "" }]
                });
            } else {
                luckyPhase.roles[0].activePlayers = luckyPlayers;
            }
        }
    },
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.merchantBackfire === player.seatNumber) {
            deathMap[player.seatNumber] = 'skill_backfire';
            ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：奇蹟商人交易給狼人，遭到反噬死亡)`;
        }
    },
    hasAction: (ctx, mySeat) => {
        return !ctx.getPlayer(mySeat).data.hasTraded; 
    },
    getPrompt: () => "選擇交易對象 (限用一次)\n若贈與狼人將遭到反噬死亡",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [
        { id: 'give_check', text: '贈與查驗', requiresTarget: true },
        { id: 'give_poison', text: '贈與毒藥', requiresTarget: true },
        { id: 'give_guard', text: '贈與守護', requiresTarget: true },
        { id: 'pass', text: '不交易', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【保留交易權利】";

        const p = act.player;
        const target = act.targets[0];
        const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
        const tPlayer = ctx.getPlayer(actualTarget);
        
        p.data.hasTraded = true;

        const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
        const isWolf = ROLE_DICTIONARY[checkRole]?.faction === 'wolf';

        if (isWolf) {
            ctx.nightTags = ctx.nightTags || {};
            ctx.nightTags.merchantBackfire = p.seatNumber;
            return `【交易失敗：目標為狼人，即將反噬】`;
        }

        const skillMap = { 'give_check': '查驗', 'give_poison': '毒藥', 'give_guard': '守護' };
        tPlayer.data.grantedSkill = skillMap[act.actionId];
        tPlayer.data.grantedSkillUsed = false;
        
        tPlayer.data.virtualRoles = tPlayer.data.virtualRoles || [];
        if (!tPlayer.data.virtualRoles.includes('幸運兒')) {
            tPlayer.data.virtualRoles.push('幸運兒');
        }
        let luckyPhase = ctx.nightSequence.find(seq => seq.phaseId === 'lucky_action');
        if (luckyPhase) {
            let luckyRole = luckyPhase.roles.find(r => r.roleName === '幸運兒');
            if (luckyRole && !luckyRole.activePlayers.some(ap => ap.seatNumber === tPlayer.seatNumber)) {
                luckyRole.activePlayers.push(tPlayer);
            }
        } else {
            ctx.nightSequence.push({
                phaseId: 'lucky_action', phaseName: '幸運兒行動',
                roles: [{ roleName: '幸運兒', roleDef: RoleRegistry.plugins['幸運兒'], activePlayers: [tPlayer], resultLog: "" }]
            });
        }

        return `【交易成功：贈與 ${tPlayer.data.grantedSkill} 給 ${target}號】`;
    }
});

RoleRegistry.register("幸運兒", {
    actionType: "single_select",
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.data.luckyGuardedSeat) {
            const gSeat = player.data.luckyGuardedSeat;
            if (deathMap[gSeat] === 'killed' || deathMap[gSeat] === 'poisoned') {
                delete deathMap[gSeat];
            }
            player.data.luckyGuardedSeat = null; 
        }
    },
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return p.data.grantedSkill && !p.data.grantedSkillUsed;
    },
    getPrompt: (ctx, mySeat) => {
        const skill = ctx.getPlayer(mySeat).data.grantedSkill;
        return `你收到了奇蹟商人贈與的${skill}\n請選擇目標或跳過`;
    },
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: (ctx, mySeat) => {
        const skill = ctx.getPlayer(mySeat).data.grantedSkill;
        if (skill === '查驗') return [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '保留技能', requiresTarget: false }];
        if (skill === '毒藥') return [{ id: 'poison', text: '毒殺', requiresTarget: true }, { id: 'pass', text: '保留技能', requiresTarget: false }];
        if (skill === '守護') return [{ id: 'guard', text: '守護', requiresTarget: true }, { id: 'pass', text: '保留技能', requiresTarget: false }];
        return [];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【保留技能】";

        const p = act.player;
        const target = act.targets[0];
        const skill = p.data.grantedSkill;

        p.data.grantedSkillUsed = true; 

        if (skill === '查驗' && act.actionId === 'check') {
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
            const isWolf = ROLE_DICTIONARY[checkRole]?.faction === 'wolf';
            let alignment = isWolf ? "狼人" : "好人";
            
            const pluginDef = RoleRegistry.plugins[tPlayer.role];
            if (pluginDef && pluginDef.seenBySeerAsGood) alignment = "好人";

            p.data.seerRecords = p.data.seerRecords || {};
            p.data.seerRecords[target] = alignment;
            p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true }; 
            p.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
            
            return `【查驗: ${target}號】`;
        }

        if (skill === '毒藥' && act.actionId === 'poison') {
            if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
            ctx.nightTags.poisoned.push(parseInt(target));
            ctx.nightTags.poisonerSeat = p.seatNumber; 
            return `【毒殺: ${target}號】`;
        }

        if (skill === '守護' && act.actionId === 'guard') {
            p.data.luckyGuardedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target; 
            return `【守護: ${target}號】`;
        }
    }
});

RoleRegistry.register("魔術師", {
    canSelfExplode: false,
    nightPhase: "first_half",
    actionType: "double_select",
    onNightStart: (ctx, player) => {
        player.data.usedMagicianTargets = player.data.usedMagicianTargets || [];
    },
    getPrompt: () => "選擇兩位玩家進行魔術交換\n(每個號碼全局只能被你選擇一次)",
    getSelectableSeats: (ctx, mySeat) => {
        const used = ctx.getPlayer(mySeat).data.usedMagicianTargets || [];
        // 過濾掉曾經選過的號碼，確保不重複
        return ctx.getAlivePlayers().filter(p => !used.includes(p.seatNumber)).map(p => p.seatNumber);
    },
    getButtons: () => [
        { id: 'swap', text: '確認交換', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass' || !act.targets || act.targets.length < 2) return "【跳過行動】";

        const t1 = parseInt(act.targets[0]);
        const t2 = parseInt(act.targets[1]);
        
        ctx.magicianSwap = [t1, t2];
        act.player.data.usedMagicianTargets.push(t1, t2);

        return `【交換: ${t1}號 與 ${t2}號】`;
    }
});

RoleRegistry.register("狼鴉之爪", {
    canSelfExplode: false,
    seenAsWolf: true,
    canSeeWolves: false,
    hasWolfChatAccess: (ctx, player) => {
        return !!player.data.isAwakened;
    },
    
    nightPhase: ["midnight", "second_half"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    
    onNightStart: (ctx, player) => {
        const totalWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf').length;
        if (!player.isDead && !player.data.isAwakened && totalWolves <= 2) {
            player.data.isAwakened = true;
            
            player.data.customTopTags = player.data.customTopTags || {};
            ctx.players.forEach(p => {
                if (p.seatNumber !== player.seatNumber) {
                    const pluginDef = RoleRegistry.plugins[p.role];
                    if (pluginDef && pluginDef.seenAsWolf) {
                        player.data.customTopTags[p.seatNumber] = p.role;
                    }
                }
            });
        }
    },
    hasAction: (ctx, mySeat) => {
        const player = ctx.getPlayer(mySeat);
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        
        if (!player.data.isAwakened) return false;
        if (step === 'midnight') return true; 
        if (step === 'second_half') return !player.data.hasUsedClaw; 
        return false;
    },
    getPrompt: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "你已覺醒，請與同伴一起選擇襲擊目標 (或跳過以空刀)";
        return "【狼鴉之爪技能】\n請選擇一名玩家發動致命利爪\n(無視解藥/守護/攝夢，全局限用一次)";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence[ctx.currentNightStepIndex].phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
    },
    getButtons: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        return [{ id: 'claw_kill', text: '發動利爪', requiresTarget: true }, { id: 'pass', text: '保留技能', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【無效行動】";
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        
        if (step === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }
        if (step === 'second_half') {
            if (act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
                return "【保留技能】";
            }
            
            const target = act.targets[0];
            act.player.data.hasUsedClaw = true;
            if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
            
            // [修復] 將目標即時轉為實體座位，使其遵循魔術師換牌機制的統一標準
            ctx.nightTags.clawKilled = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target); 
            return `【發動利爪: ${target}號】`;
        }
    },
    
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.clawKilled) {
            const t = ctx.nightTags.clawKilled;
            deathMap[t] = 'killed'; 
            if (!ctx.nightTags.clawLogWritten) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：狼鴉之爪發動技能，無視防禦擊殺 ${t} 號)`;
                ctx.nightTags.clawLogWritten = true;
            }
        }
    }
});
