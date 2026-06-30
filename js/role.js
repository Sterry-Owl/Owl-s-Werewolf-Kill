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

    Engine.EventBus.on('PLAYER_DIED', ({ context, player, reason }) => {
        if (player.role === '獵人' && reason !== 'poisoned') {
            player.isRevealed = true;
            context.pendingHunter = player.seatNumber; 
        }

        // [新增] 狼王被動：被狼刀、被票出、被獵人射皆可開槍。被毒(poisoned)與自爆(explode)不可發動。
        if (player.role === '狼王' && reason !== 'poisoned' && reason !== 'explode') {
            player.isRevealed = true;
            context.pendingWolfKing = player.seatNumber;
        }

        if (player.role === '白痴' && reason === 'voted') {
            player.isRevealed = true;
            Engine.EventBus.emit('BROADCAST_MESSAGE', `【突發事件】${player.seatNumber} 號玩家為白痴，翻牌！\n(已喪失投票與被指定權力，須移交警徽，但保留發言權)`);
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
            context.systemLog = `【突發事件】${player.seatNumber} 號玩家自爆！\n選舉中斷（視同平票）。`;
        } else {
            context.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇自爆！發言階段立即結束！`;
        }

        Engine.EventBus.emit('CHECK_WIN_CONDITION', context);
        if (context.phase !== 'GAME_OVER') Engine.EventBus.emit('FORCE_ENTER_NIGHT', context);
    });
},

RoleRegistry.register("狼人", {
    canSelfExplode: true,
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

RoleRegistry.register("女巫", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "dynamic_buttons",
    getPrompt: (ctx, mySeat) => {
        if (!ctx.witchState) ctx.witchState = {};
        if (ctx.witchState.antidoteUsed) return "你的解藥已用過，無法得知刀口。\n請選擇要發動的技能：";
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
        if (!act) return "【跳過行動】"; 
        if (!ctx.witchState) ctx.witchState = {};
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'save' && !ctx.witchState.antidoteUsed) {
            if (ctx.nightTags?.killed?.length > 0) {
                ctx.witchState.savedSeat = ctx.nightTags.killed[0];
                ctx.nightTags.killed = []; 
                ctx.nightTags.witchUsedSaveTonight = true;
                ctx.witchState.antidoteUsed = true;
                return "【解救成功】";
            }
            return "【無刀可救】";
        } else if (act.actionId === 'poison' && !ctx.witchState.poisonUsed && !ctx.nightTags?.witchUsedSaveTonight) {
        // [新增] 如果解藥還沒用過，且你想毒的人剛好是刀口，直接擋下來
        if (!ctx.witchState.antidoteUsed && ctx.nightTags?.killed?.length > 0 && target === ctx.nightTags.killed[0]) {
            return "【無法發動：解藥未用時不可毒殺刀口】";
            }
            if (target) {
                ctx.nightTags.poisoned.push(target);
                ctx.witchState.poisonUsed = true;
                return `【毒殺: ${target}號】`;
            }
            return "【空毒】";
        }
        return "【跳過行動】";
    }
});

RoleRegistry.register("預言家", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    getPrompt: () => "選擇今晚的查驗目標",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [{ id: 'confirm', text: '確認查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const tPlayer = ctx.getPlayer(target);
            const isWolf = (tPlayer.role && tPlayer.role.includes("狼人")); 
            const alignment = isWolf ? "狼人" : "好人";
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = alignment;
            act.player.data.latestCheckResult = { seat: target, alignment: alignment };
            act.player.data.tempPrivateMessage = `系統提示：${target}號玩家為【${alignment}】陣營。`;
            return `【查驗: ${target}號】`;
        }
        return "【跳過行動】";
    }
});

RoleRegistry.register("平民", { canSelfExplode: false });
RoleRegistry.register("獵人", { canSelfExplode: false });
RoleRegistry.register("白痴", { canSelfExplode: false });
RoleRegistry.register("狼王", {
    canSelfExplode: true,
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
            ctx.lastGuardedSeat = null; // 空守後，隔晚可以守護任何人
            return "【空守】";
        }
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        ctx.guardedSeat = target;
        ctx.lastGuardedSeat = target; // 記憶本次守護目標，防止明晚連守
        return `【守護: ${target}號】`;
    }
});