// ==========================================
// v4.0.3 角色系統與被動技能插件 (Role Plugins)
// 檔案位置: js/role.js
// ==========================================

window.RoleRegistry = {
    plugins: {},
    register: function(roleName, config) { this.plugins[roleName] = config; },

initPassives: function(ctx) {
    // [新增] 註冊天亮結算的過濾器邏輯
    if (ctx) {
        ctx.addFilter('DAWN_DEATH_EVALUATION', (calc) => {
            let finalKilled = [];
            calc.killed.forEach(targetSeat => {
                const isGuarded = calc.guarded.includes(targetSeat);
                const isSaved = calc.saved.includes(targetSeat);

                if (isGuarded && isSaved) {
                    // 同守同救 = 奶穿 = 死亡
                    finalKilled.push(targetSeat);
                } else if (isGuarded || isSaved) {
                    // 單守 或 單救 = 存活 (不加入 finalKilled)
                } else {
                    // 沒被守也沒被救 = 死亡
                    finalKilled.push(targetSeat);
                }
            });
            return finalKilled;
        });
    }
    Engine.EventBus.on('START_NIGHT', () => {
        if (ctx.votedOutToday) {
            const target = ctx.getPlayer(ctx.votedOutToday);
            const isWolf = ROLE_DICTIONARY[target.role]?.faction === 'wolf';
            const alignment = isWolf ? '狼人' : '好人';

            ctx.players.forEach(p => {
                if (p.role === '守墓人' && !p.isDead) {
                    p.data.seerRecords = p.data.seerRecords || {};
                    p.data.seerRecords[ctx.votedOutToday] = alignment;
                    p.data.latestCheckResult = { seat: ctx.votedOutToday, alignment: alignment };
                }
            });
        }
    });
    Engine.EventBus.on('PLAYER_DIED', ({ context, player, reason }) => {
        if (player.role === '獵人' && reason !== 'poisoned') {
            context.pendingHunter = player.seatNumber; 
        }
        // [新增] 狼王被動：被狼刀、被票出、被獵人射皆可開槍。被毒(poisoned)與自爆(explode)不可發動。
        if (player.role === '狼王' && reason !== 'poisoned' && reason !== 'explode' && reason !== 'dueled') {
            context.pendingWolfKing = player.seatNumber;
        }

        if (player.role === '白痴' && reason === 'voted') {
            player.isRevealed = true;
            Engine.EventBus.emit('BROADCAST_MESSAGE', `${player.seatNumber} 號玩家為白痴，進行翻牌。\n(已喪失投票與被指定權力，須移交警徽，但保留發言權)`);
        }
    });

    Engine.EventBus.on('WOLF_EXPLODE', ({ context, player }) => {
        if (!player || player.isDead || !this.plugins[player.role]?.canSelfExplode) return;

        // 這裡傳入 'explode' 作為死因，會被上面的狼王判定自動過濾，確保自爆不開槍
        player.kill('explode', context);
        player.isRevealed = true;

        if (context.sheriff.seat === player.seatNumber) {
            context.sheriff.badgeLost = true;
            context.sheriff.seat = null;
        }

        if (['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING'].includes(context.phase)) {
            context.sheriff.electionDay++;
            if (context.sheriff.electionDay > 2) context.sheriff.badgeLost = true;
            context.systemLog = `${player.seatNumber} 號玩家自爆，\n警長選舉被中斷。`;
        } else {
            context.systemLog = `${player.seatNumber} 號玩家選擇自爆，天黑請閉眼。`;
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
    nightPhase: "midnight",      
    actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或選擇跳過以空刀)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    getPassTags: (ctx, mySeat) => {
        let tags = [];
        Object.values(ctx.wolfPreviews || {}).forEach(preview => {
            if (String(preview.target) === 'pass' && preview.seat !== mySeat) tags.push(`${preview.seat}號`);
        });
        return tags;
    },
    resolveNightAction: (ctx, actions) => {
        let validTargets = actions.filter(act => act.actionId !== 'pass' && act.targets.length > 0).map(act => act.targets[0]);
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
                ctx.nightTags.killed = []; 
                ctx.nightTags.witchUsedSaveTonight = true;
                ctx.witchState.antidoteUsed = true;
                return "生，還是死，這是一個問題。";
            }
            return "生，還是死，這是一個問題。";
        } else if (act.actionId === 'poison' && !ctx.witchState.poisonUsed && !ctx.nightTags?.witchUsedSaveTonight) {
        if (!ctx.witchState.antidoteUsed && ctx.nightTags?.killed?.length > 0 && target === ctx.nightTags.killed[0]) {
            return "解藥尚未使用時，不可毒殺被襲擊者。";
            }
            if (target) {
                ctx.nightTags.poisoned.push(target);
                ctx.witchState.poisonUsed = true;
                return `也許${target}號玩家的生命，就到此為止了。`;
            }
            return "暫時，放過你們一天。";
        }
        return "跳過行動";
    }
});

RoleRegistry.register("預言家", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    getPrompt: () => "選擇今晚的查驗目標",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const tPlayer = ctx.getPlayer(target);
            const isWolf = (tPlayer.role && ROLE_DICTIONARY[tPlayer.role]?.faction === 'wolf');
            const alignment = isWolf ? "狼人" : "好人";
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = alignment;
            act.player.data.latestCheckResult = { seat: target, alignment: alignment };
            act.player.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
            return `查驗: ${target}號`;
        }
        return "跳過行動";
    }
});

RoleRegistry.register("平民", { canSelfExplode: false });
RoleRegistry.register("獵人", { canSelfExplode: false });
RoleRegistry.register("白痴", { canSelfExplode: false });
RoleRegistry.register("狼王", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    nightPhase: "midnight",      
    actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或跳過以空刀)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    getPassTags: (ctx, mySeat) => {
        let tags = [];
        Object.values(ctx.wolfPreviews || {}).forEach(preview => {
            if (String(preview.target) === 'pass' && preview.seat !== mySeat) tags.push(`${preview.seat}號`);
        });
        return tags;
    },
    resolveNightAction: (ctx, actions) => {
        let validTargets = actions.filter(act => act.actionId !== 'pass' && act.targets.length > 0).map(act => act.targets[0]);
        if (validTargets.length === 0) return "【空刀】";
        const finalTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
        if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
        ctx.nightTags.killed.push(parseInt(finalTarget));
        return `【襲擊: ${finalTarget}號】`;
    }
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
        ctx.guardedSeat = target;
        ctx.lastGuardedSeat = target;
        return `【守護: ${target}號】`;
    }
});
RoleRegistry.register("白狼王", {
    canSelfExplode: false, 
    canSeeWolves: true, seenAsWolf: true, isAttacker: true,
    nightPhase: "midnight", actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標 (或跳過以空刀)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction,
    daySkill: {
        id: 'wwk_explode', buttonText: '自爆並帶走', requiresTarget: true,
        allowedPhases: ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'DAY_DISCUSSION', 'PK_SPEECH', 'LAST_WORDS'],
        getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
        resolve: (ctx, player, targetSeat) => {
            const targetPlayer = ctx.getPlayer(targetSeat);
            player.isRevealed = true;
            player.kill('explode', ctx);
            targetPlayer.kill('shot', ctx); 
            if (ctx.sheriff.seat === player.seatNumber) { ctx.sheriff.badgeLost = true; ctx.sheriff.seat = null; }
            if (['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING'].includes(ctx.phase)) {
                ctx.sheriff.electionDay++;
                if (ctx.sheriff.electionDay > 2) ctx.sheriff.badgeLost = true;
            }

            ctx.systemLog = `${player.seatNumber} 號玩家(白狼王)自爆，\n並帶走了 ${targetSeat} 號玩家！天黑請閉眼。`;
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
        allowedPhases: ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'DAY_DISCUSSION', 'PK_SPEECH', 'LAST_WORDS'],
        getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
        resolve: (ctx, player, targetSeat) => {
            const targetPlayer = ctx.getPlayer(targetSeat);
            player.isRevealed = true; // 騎士翻牌自證
            ctx.systemLog = `【突發事件】\n${player.seatNumber} 號玩家(騎士)發起決鬥，\n目標是 ${targetSeat} 號玩家！`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            const isWolf = ROLE_DICTIONARY[targetPlayer.role]?.faction === 'wolf';
            if (isWolf) {
                targetPlayer.kill('dueled', ctx);
                if (['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_VOTING'].includes(ctx.phase)) {
                    ctx.sheriff.electionDay++;
                    if (ctx.sheriff.electionDay > 2) ctx.sheriff.badgeLost = true;
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
                        // [關鍵修復] 強制把目的地設為「當前階段 (例如警長發言)」，防止狀態機迷航
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
    // [淨化] 拔除副作用，getPrompt 現在只是一面倒影，負責渲染文字
    getPrompt: (ctx) => {
        if (ctx.votedOutToday) {
            const target = ctx.getPlayer(ctx.votedOutToday);
            const isWolf = ROLE_DICTIONARY[target.role]?.faction === 'wolf';
            const alignment = isWolf ? '狼人' : '好人';

            return `昨天白天被放逐的 ${ctx.votedOutToday} 號玩家是【${alignment}】。\n請點擊「了解」結束回合。`;
        }
        return "昨天白天沒有人被放逐。\n請點擊「了解」結束回合。";
    },
    getSelectableSeats: () => [], // 不需選人
    getButtons: () => [{ id: 'confirm', text: '了解', requiresTarget: false }],
    resolveNightAction: () => "確認資訊"
});

RoleRegistry.register("石像鬼", {
    canSelfExplode: false,
    canSeeWolves: false,
    seenAsWolf: false,
    isAttacker: true,    
    nightPhase: ["first_half", "midnight"], 
    actionType: "dynamic_buttons",
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return "選擇今晚的查驗目標\n(將得知該玩家具體身分)";
        
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        if (otherWolves.length > 0) return "狼同伴存活，無法操刀。";
        return "狼同伴已全數陣亡，請選擇襲擊目標。";
    },
    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
        
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        if (otherWolves.length > 0) return [];
        return ctx.getAlivePlayers().map(p => p.seatNumber);
    },
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        if (step.phaseId === 'first_half') return [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        
        const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        if (otherWolves.length > 0) return [{ id: 'pass', text: '跳過 (狼同伴操刀)', requiresTarget: false }];
        return [{ id: 'kill', text: '襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "跳過行動";
        
        const step = ctx.nightSequence[ctx.currentNightStepIndex];
        const target = act.targets[0];
        
        if (step.phaseId === 'first_half' && act.actionId === 'check') {
            const tPlayer = ctx.getPlayer(target);
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
