// ==========================================
// v4.3.0 角色系統與被動技能插件 (Role Plugins)
// 檔案位置: js/role.js
// ==========================================

window.RoleRegistry = {
    plugins: {},
    register: function(roleName, config) { this.plugins[roleName] = config; },

    initPassives: function(ctx) {
        if (ctx) {
            ctx.getActualTarget = function(seat) {
                if (this.magicianSwap) {
                    if (parseInt(seat) === this.magicianSwap[0]) return this.magicianSwap[1];
                    if (parseInt(seat) === this.magicianSwap[1]) return this.magicianSwap[0];
                }
                return parseInt(seat);
            };

            ctx.getSkillTarget = function(targetSeat, skillType, actorSeat) {
                let actual = ctx.getActualTarget ? ctx.getActualTarget(targetSeat) : parseInt(targetSeat);
                
                // [新增] 狼人陣營發動的所有技能免疫反彈 (包含侍女偷竊的技能)
                const actor = this.getPlayer(actorSeat);
                if (actor && this.getDynamicFaction(actor) === 'wolf') {
                    return actual;
                }

                if (this.nightTags && this.nightTags.sealedSeat === actual) {
                    // [新增] 擴充 'gift' (奇蹟商人的贈禮) 納入反彈清單
                    if (['check', 'poison', 'guard', 'dream', 'bless', 'curse', 'hunt', 'sanction', 'gift'].includes(skillType)) {
                        const sealer = this.getPlayer(this.nightTags.sealerSeat);
                        if (sealer) sealer.data.sealPermanentlyLost = true;
                        if (typeof Engine !== 'undefined' && Engine.EventBus) {
                            Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】蝕時狼妃封鎖生效，技能反彈至 ${actorSeat} 號`);
                        }
                        return parseInt(actorSeat);
                    }
                }
                return actual;
            };

            ctx.getDynamicFaction = function(p) {
                if (p.data.isConverted) return 'wolf';
                const plugin = RoleRegistry.plugins[p.role];
                return (plugin && typeof plugin.getFaction === 'function') ? plugin.getFaction(this, p) : (ROLE_DICTIONARY[p.role]?.faction || 'good');
            };

            ctx.getDynamicType = function(p) {
                // [新增] 轉化者全域視為狼人神職/平民類型
                if (p.data.isConverted) return 'wolf';
                const plugin = RoleRegistry.plugins[p.role];
                return (plugin && typeof plugin.getType === 'function') ? plugin.getType(this, p) : (ROLE_DICTIONARY[p.role]?.type || 'villager');
            };

            ctx.getSeerAlignment = function(targetSeat) {
                const tPlayer = this.getPlayer(targetSeat);
                const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
                const isWolf = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[checkRole]?.faction === 'wolf';
                let alignment = isWolf ? "狼人" : "好人";

                if (tPlayer.data.isConverted && this.nightCount >= 2) {
                    alignment = "狼人";
                }
                
                const pluginDef = RoleRegistry.plugins[tPlayer.role];
                if (pluginDef) {
                    if (pluginDef.seenBySeerAsGood) {
                        const forceGood = typeof pluginDef.seenBySeerAsGood === 'function' ? pluginDef.seenBySeerAsGood(this, targetSeat) : pluginDef.seenBySeerAsGood;
                        if (forceGood) alignment = "好人";
                    }
                    if (pluginDef.seenBySeerAsWolf) {
                        const forceWolf = typeof pluginDef.seenBySeerAsWolf === 'function' ? pluginDef.seenBySeerAsWolf(this, targetSeat) : pluginDef.seenBySeerAsWolf;
                        if (forceWolf) alignment = "狼人";
                    }
                }
                return alignment;
            };

            ctx.addFilter('DAWN_DEATH_EVALUATION', (calc) => {
                const sanitize = (arr) => (arr || []).map(x => parseInt(x));
                calc.killed = sanitize(calc.killed);
                calc.poisoned = sanitize(calc.poisoned);
                calc.saved = sanitize(calc.saved);
                calc.dreamed = sanitize(calc.dreamed);
                calc.guarded = sanitize(calc.guarded);
                calc.lastDreamed = sanitize(calc.lastDreamed);
                ctx.players.forEach(p => {
                    if (p.role === '機械狼') {
                        if (p.data.mwDreamedSeat && !calc.dreamed.includes(p.data.mwDreamedSeat)) {
                            calc.dreamed.push(p.data.mwDreamedSeat);
                        }
                        if (p.data.mwLastDreamedSeat && !calc.lastDreamed.includes(p.data.mwLastDreamedSeat)) {
                            calc.lastDreamed.push(p.data.mwLastDreamedSeat);
                        }
                    }
                });
                ctx.players.forEach(p => {
                    if (p.data.luckyGuardedSeat) {
                        calc.guarded.push(parseInt(p.data.luckyGuardedSeat));
                        p.data.luckyGuardedSeat = null; 
                    }
                    if (p.data.scholarGuardedSeat) {
                        calc.guarded.push(parseInt(p.data.scholarGuardedSeat));
                        p.data.scholarGuardedSeat = null; 
                    }
                });
                
                if (ctx.magicianSwap) {
                    const swapMap = (arr) => arr.map(seat => ctx.getActualTarget(seat));
                    calc.killed = swapMap(calc.killed);
                    calc.saved = swapMap(calc.saved);
                }
                
                let deathMap = {};
                if (ctx.nightTags?.demonHunterKills) ctx.nightTags.demonHunterKills.forEach(seat => deathMap[seat] = 'killed');
                if (ctx.nightTags?.demonHunterBackfires) ctx.nightTags.demonHunterBackfires.forEach(seat => deathMap[seat] = 'skill_backfire');
                if (ctx.nightTags?.clashDeaths) ctx.nightTags.clashDeaths.forEach(seat => deathMap[seat] = 'skill_backfire');

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
                if (ctx.blessedSeat && ctx.devouredSeat === ctx.blessedSeat && ctx.devourerSeat) {
                    deathMap[ctx.devourerSeat] = 'skill_backfire';
                    if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】蝕日侍女吞噬了被保佑的 ${ctx.blessedSeat} 號，遭到流光反噬`);
                }
                if (ctx.nightTags?.buffBlessedSeat && ctx.devouredSeat === ctx.nightTags.buffBlessedSeat && ctx.devourerSeat) {
                    deathMap[ctx.devourerSeat] = 'skill_backfire';
                    if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】蝕日侍女吞噬了被增幅保佑的 ${ctx.nightTags.buffBlessedSeat} 號，遭到流光反噬`);
                }
                
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
                if (ctx.blessedSeat) {
                    if (['killed', 'poisoned', 'doubledreamed', 'bloodlusted', 'skill_backfire'].includes(deathMap[ctx.blessedSeat])) {
                        delete deathMap[ctx.blessedSeat];
                        if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】流光伯爵保佑生效，免除了 ${ctx.blessedSeat} 號的死亡`);
                    }
                }
                if (ctx.nightTags?.buffBlessedSeat) {
                    const bSeat = ctx.nightTags.buffBlessedSeat;
                    if (['killed', 'poisoned', 'doubledreamed', 'bloodlusted', 'skill_backfire'].includes(deathMap[bSeat])) {
                        delete deathMap[bSeat];
                        if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】流光伯爵增幅保佑生效，免除了 ${bSeat} 號的死亡`);
                    }
                }

                return deathMap;
            });

            ctx.addFilter('DEATH_ANNOUNCE_INTERCEPTOR', (result, args) => {
                ctx.players.forEach(p => {
                    const plugin = RoleRegistry.plugins[p.role];
                    if (plugin && typeof plugin.onDeathAnnounceIntercept === 'function') {
                        const intercept = plugin.onDeathAnnounceIntercept(ctx, p, args.deathMap);
                        if (intercept && intercept.prevented) {
                            result = intercept;
                        }
                    }
                });
                return result;
            });

            ctx.addFilter('NIGHT_ACTION_PERMISSION', (canAct, args) => {
                const feared = args.context.fearedSeat;
                if (feared === args.player.seatNumber) return false;
                if (args.context.devouredSeat === args.player.seatNumber) return false;
                if (args.context.bloodMoonSilenceNight && args.context.bloodMoonSilenceNight === args.context.nightCount) {
                    if (typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[args.player.role]?.type === 'god') return false;
                }
                if (args.context.nightTags?.scholarDebuffTarget === args.player.seatNumber) {
                    if (typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[args.player.role]?.type === 'god') return false;
                }
                return canAct;
            });
            ctx.addFilter('EVALUATE_BEAR_ROAR', (result, args) => {
                const hasBearInGame = ctx.players.some(p => p.role === '熊' || (p.role === '機械狼' && p.data.learnedRole === '熊'));
                if (!hasBearInGame) return null;

                const checkBearRoar = (bearSeat) => {
                    const leftSeat = ctx.getNextAliveSeat(bearSeat, -1);
                    const rightSeat = ctx.getNextAliveSeat(bearSeat, 1);
                    const lP = ctx.getPlayer(leftSeat);
                    const rP = ctx.getPlayer(rightSeat);

                    const isWolf = (p) => p && ctx.getDynamicFaction(p) === 'wolf';
                    const hasRoar = isWolf(lP) || isWolf(rP);
                    
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【熊判定】左側${leftSeat}號，右側${rightSeat}號，判定為：${hasRoar ? '有狼' : '無狼'}`);
                    }
                    return hasRoar;
                };
                const aliveBears = ctx.players.filter(p => !p.isDead && (p.role === '熊' || (p.role === '機械狼' && p.data.machineState === 1 && p.data.learnedRole === '熊')));
                
                if (aliveBears.length > 0) {
                    const hasRoar = aliveBears.some(b => checkBearRoar(b.seatNumber));
                    return hasRoar ? "【熊有咆哮】" : "【熊沒有咆哮】";
                } else {
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【熊判定】熊已死亡，強制判定為無咆哮`);
                    }
                    return "【熊沒有咆哮】";
                }
            });

            // ==========================================
            // [新增] 特殊資訊區域過濾器 (完全收斂角色知識)
            // ==========================================
            ctx.addFilter('BUILD_SPECIAL_INFOS', (infos, args) => {
                const { context, player } = args;
                const currentPhase = context.phase;
                
                if (currentPhase === 'BEAR_ROAR_ANNOUNCE' && context.bearRoarResult) {
                    if (context.bearRoarResult === "【熊有咆哮】") {
                        infos.push({ text: "熊咆哮了", subtext: "熊的左右兩邊有狼人" });
                    } else if (context.bearRoarResult === "【熊沒有咆哮】") {
                        infos.push({ text: "熊沒有咆哮", subtext: "熊的左右兩邊都是好人" });
                    }
                }

                const isNightAction = currentPhase === 'NIGHT_ACTION';
                const stepId = context.nightSequence?.[context.currentNightStepIndex]?.phaseId;
                const isFirstHalf = isNightAction && stepId === 'first_half';
                const alchemistPreDecisionPhases = [
                    'BEAR_ROAR_ANNOUNCE', 'DAWN_DEATH_ANNOUNCE', 'SHERIFF_CANDIDACY', 
                    'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_RE_ELECTION_BAILOUT', 
                    'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 
                    'DAY_DISCUSSION', 'DAY_PK_SPEECH', 'PRINCE_SPEECH'
                ];
                const isWitchRestricted = context.fearedSeat === player.seatNumber ||
                                          context.devouredSeat === player.seatNumber ||
                                          (context.bloodMoonSilenceNight === context.nightCount);
                                          
                if (player.role === '煉金魔女' && !player.isDead && !player.data.snakeUsed && !isWitchRestricted && alchemistPreDecisionPhases.includes(currentPhase)) {
                    const victim = context.nightTags?.killed?.[0];
                    if (victim) {
                        infos.push({ text: `昨晚被襲擊的是${victim}號`, subtext: "煉金魔女會事先得知刀口" });
                    }
                }

                // 2. 增幅 / 削弱 (僅在夜晚且非前半夜顯示)
                const isNightPhase = ['NIGHT_ACTION', 'MIDNIGHT_RESULT_DISPLAY'].includes(currentPhase);
                if (isNightPhase && !isFirstHalf) {
                    const pRole = player.data.camouflageRole || player.role;
                    const pFaction = context.getDynamicFaction(player);
                    const pType = typeof ROLE_DICTIONARY !== 'undefined' ? ROLE_DICTIONARY[pRole]?.type : null;
                    const buffableRoles = ['預言家', '女巫', '守衛', '獵魔人', '流光伯爵', '攝夢人', '魔鏡少女', '覺醒預言家'];
                    
                    if (player.data.virtualRoles && player.data.virtualRoles.includes('受增幅者')) {
                        if (buffableRoles.includes(pRole) || pFaction === 'wolf') {
                            infos.push({ text: "你受到增幅", subtext: "可以多使用一次自身技能" });
                        }
                    } else if (context.nightTags?.scholarDebuffTarget === player.seatNumber) {
                        if (pType === 'god' || pFaction === 'wolf') {
                            infos.push({ text: "你受到削弱", subtext: "無法使用自身技能" });
                        }
                    }
                }

                if (context.charmedByPiper && context.charmedByPiper.length > 0) {
                    const charmedList = [...context.charmedByPiper].sort((a,b)=>a-b).join(', ');
                    if (!isFirstHalf && context.charmedByPiper.includes(player.seatNumber)) {
                        infos.push({ text: `你被誘引了，已被誘引者有${charmedList}號`, subtext: "吹笛者誘引存活的所有人將獲勝" });
                    }
                    if (player.role === '吹笛者') {
                        infos.push({ text: `已被誘引的名單者有${charmedList}號`, subtext: "誘引全場存活玩家即可獲勝" });
                    }
                }
                if (player.role === '暗戀者' && context.crushTarget && context.admirerSeat === player.seatNumber) {
                    infos.push({ text: `你的暗戀對象是 ${context.crushTarget} 號`, subtext: "你隨暗戀對象同榮共敗" });
                }
                if (player.role === '野孩子' && player.data.wildModelTarget) {
                    infos.push({ text: `你的榜樣是 ${player.data.wildModelTarget} 號`, subtext: "榜樣死亡後你將狂暴成為狼人" });
                }
                if (player.role === '復仇者' && player.data.avengerTarget) {
                    infos.push({ text: `你的仇恨對象是 ${player.data.avengerTarget} 號`, subtext: "你的勝利條件將與他相反" });
                }
                
                const isNight1 = context.nightCount === 1 && currentPhase === 'NIGHT_ACTION';
                if (player.data.isConverted && player.role !== '狼人' && !isNight1) {
                    infos.push({ text: `你已被巫妖轉化為狼人陣營`, subtext: "所有其餘狼人出局後你將接掌狼刀" });
                }

                if (context.lovers && context.lovers.includes(player.seatNumber)) {
                    const partner = context.lovers.find(s => s !== player.seatNumber);
                    infos.push({ 
                        text: `你是情侶，伴侶是 ${partner} 號`, 
                        subtext: "情侶一方出局，另一方隨之殉情"
                    });
                }
                if (player.role === '邱比特' && context.lovers) {
                    const l1 = context.lovers[0];
                    const l2 = context.lovers[1];
                    infos.push({
                        text: `你指定的情侶是 ${l1} 與 ${l2} 號`,
                        subtext: "邱比特要竭盡所能幫助情侶"
                    });
                }
                
                // [新增] 魅魔與其伴侶的專屬資訊面板
                if (context.succubusLovers && context.succubusLovers.includes(player.seatNumber)) {
                    const partner = context.succubusLovers.find(s => s !== player.seatNumber);
                    if (player.role === '魅魔') {
                        infos.push({
                            text: `你的伴侶是 ${partner} 號`,
                            subtext: "你們同生共死，淘汰全場其他玩家即可獲勝"
                        });
                    } else {
                        infos.push({
                            text: `你與魅魔 (${partner} 號) 連結為情侶`,
                            subtext: "你們同生共死，淘汰全場其他玩家即可獲勝"
                        });
                    }
                }
                
                return infos;
            });
        }

        Engine.EventBus.on('START_NIGHT', () => {
            if (ctx) {
                ctx.magicianSwap = null;
                ctx.devouredSeat = null;
                ctx.devourerSeat = null;
                ctx.blessedSeat = null;
                ctx.postVoteSkillTriggeredThisDay = false;
                ctx.nightTags.demonHunterKills = [];
                ctx.nightTags.demonHunterBackfires = [];
                ctx.nightTags.wolfTeamConfused = false;
                ctx.confusedSeats = [];
                
                // [控制反轉] 拔除字串硬編碼，改為讀取角色設定的 nightPriority 屬性排序
                const firstHalf = ctx.nightSequence.find(s => s.phaseId === 'first_half');
                if (firstHalf) {
                    firstHalf.roles.sort((a, b) => {
                        const getOrder = name => RoleRegistry.plugins[name]?.nightPriority || 99;
                        return getOrder(a.roleName) - getOrder(b.roleName);
                    });
                }
            }
            ctx.players.forEach(p => {
                const plugin = RoleRegistry.plugins[p.role];
                if (plugin && typeof plugin.onNightStart === 'function') plugin.onNightStart(ctx, p);
            });
        });

        Engine.EventBus.on('PHASE_CHANGED', (payload) => {
            if (!ctx) return;

            if (payload.phase === 'SHERIFF_CANDIDACY' || payload.phase === 'DAY_DISCUSSION') {
                ctx.fearedSeat = null;
                ctx.devouredSeat = null;
                if (ctx.nightTags) ctx.nightTags.scholarDebuffTarget = null;
            }

            if (payload.phase === 'DAWN_DEATH_ANNOUNCE' || payload.phase === 'BEAR_ROAR_ANNOUNCE') {
                ctx.players.forEach(p => {
                    if (p.data.virtualRoles) {
                        p.data.virtualRoles = p.data.virtualRoles.filter(role => role !== '受增幅者');
                    }
                });
            } 
            ctx.players.forEach(p => {
                const plugin = RoleRegistry.plugins[p.role];
                if (plugin && typeof plugin.onPhaseChanged === 'function') plugin.onPhaseChanged(ctx, p, payload.phase);
            });
        });

        // [控制反轉] 死亡連動與見證鉤子
        Engine.EventBus.on('PLAYER_DIED', ({ context, player, reason }) => {
            const plugin = RoleRegistry.plugins[player.role];
            let preventDefault = false;
            
            if (plugin && typeof plugin.onPlayerDied === 'function') {
                preventDefault = plugin.onPlayerDied(context, player, reason);
            }
            if (preventDefault) return;

            context.players.forEach(p => {
                if (p.seatNumber === player.seatNumber) return;
                const observerPlugin = RoleRegistry.plugins[p.role];
                if (observerPlugin && typeof observerPlugin.onOtherPlayerDied === 'function') {
                    observerPlugin.onOtherPlayerDied(context, p, player, reason);
                }
            });

            if (ROLE_DICTIONARY[player.role]?.faction === 'wolf') {
                const skipTick = plugin && typeof plugin.suppressWolfDeathTick === 'function' && plugin.suppressWolfDeathTick(context, player, reason);
                if (!skipTick) {
                    context.wolvesDiedThisTick = context.wolvesDiedThisTick || [];
                    context.wolvesDiedThisTick.push(player.role);
                }
            }
            const aliveWolves = context.getAlivePlayers().filter(p => context.getDynamicFaction(p) === 'wolf');
            if (aliveWolves.length === 1 && aliveWolves[0].data.isConverted && aliveWolves[0].role !== '狼人') {
                const survivor = aliveWolves[0];
                survivor.data.camouflageRole = survivor.role;
                survivor.role = '狼人';
                survivor.data.virtualRoles = []; 
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】其餘狼人皆已出局，轉化者 ${survivor.seatNumber} 號正式加入狼隊並失去原有技能`);
                }
            }
        });
        Engine.EventBus.on('WOLF_EXPLODE', ({ context, player }) => {
            if (!player || player.isDead || !RoleRegistry.plugins[player.role]?.canSelfExplode) return;
            
            const plugin = RoleRegistry.plugins[player.role];
            if (plugin && typeof plugin.onSelfExplode === 'function') {
                plugin.onSelfExplode(context, player);
            }

            player.kill('explode', context);
            player.isRevealed = true;

            if (context.sheriff.seat === player.seatNumber) {
                context.sheriff.badgeLost = true;
                context.sheriff.seat = null;
            }

            const sheriffPhases = ['SHERIFF_CANDIDACY', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'SHERIFF_ORDER_SELECTION', 'SHERIFF_VOTING', 'SHERIFF_PK_VOTING', 'SHERIFF_RE_ELECTION_BAILOUT'];
            if (sheriffPhases.includes(context.phase)) {
                context.systemLog = `${player.seatNumber} 號玩家自爆\n警長選舉被中斷。`;
            } else {
                context.systemLog = `${player.seatNumber} 號玩家自爆\n天黑請閉眼。`;
            }
            context.players.forEach(p => {
                if (p.data.isUntargetable && !p.isDead) {
                    if (context.nightCount >= p.data.expireNight) {
                        p.data.isUntargetable = false;
                        p.kill('skill_expired', context);
                        context.systemLog += `\n(系統紀錄：因白天提前結束，${p.seatNumber} 號白貓大限已至，跟隨倒牌出局)`;
                    }
                }
            });

            Engine.EventBus.emit('CHECK_WIN_CONDITION', context);
            if (context.phase !== 'GAME_OVER') {
                context.daySkillLastWordsQueue = [player.seatNumber];
                context.destinationPhase = 'NIGHT_TRANSITION';
                Engine.EventBus.emit('RESUME_ROUTINE');
            }
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
    getPrompt: (ctx) => {
        if (ctx.nightCount === 1 && ctx.rules.firstNightKill === 'disabled') return "【規則：首夜無刀】\n今晚無法發起襲擊，可使用語音或右下角通訊頻道交流。";
        return "選擇今晚的襲擊目標";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightCount === 1 && ctx.rules.firstNightKill === 'disabled') return [];
        let seats = ctx.getAlivePlayers()
            .filter(p => !RoleRegistry.plugins[p.role]?.immuneToWolfBite)
            .map(p => p.seatNumber);
            
        if (ctx.nightTags?.restrictedWolfTargets?.length > 0) {
            seats = seats.filter(s => ctx.nightTags.restrictedWolfTargets.includes(s));
        }
        return seats;
    },
    getButtons: (ctx) => {
        if (ctx.nightCount === 1 && ctx.rules.firstNightKill === 'disabled') return [{ id: 'pass', text: '確認', requiresTarget: false }];
        return [{ id: 'confirm', text: '確認', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        if (ctx.nightTags.wolfKillResolvedThisTurn) return "已參與狼人陣營襲擊";
        if (ctx.nightTags.wolfTeamFeared || ctx.nightTags.wolfTeamConfused || ctx.nightTags.wolfTeamScholarDebuffed) {
            ctx.nightTags.wolfKillResolvedThisTurn = true;
            if (ctx.nightTags.wolfTeamConfused) return "【空刀】(狼隊遭受迷惑)";
            if (ctx.nightTags.wolfTeamScholarDebuffed) return "【空刀】(狼隊遭受削弱)";
            return "【空刀】(狼隊遭受恐懼)";
        }
        const allWolfActions = ctx.currentStepActions.filter(act => ctx.getDynamicFaction(act.player) === 'wolf');
        let validTargets = allWolfActions.filter(act => act.actionId !== 'pass' && act.targets.length > 0).map(act => act.targets[0]);
        ctx.nightTags.wolfKillResolvedThisTurn = true; 
        if (validTargets.length === 0) return "空刀";
        const finalTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
        
        if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
        ctx.nightTags.killed.push(parseInt(finalTarget));
        
        return `襲擊: ${finalTarget}號`;
    },
    exportedSkills: {
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 雙刀】選擇額外襲擊目標",
            getSelectableSeats: (ctx, mySeat) => RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat),
            getButtons: () => [{ id: 'kill', text: '額外襲擊', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
                ctx.nightTags.killed.push(parseInt(target));
                return `【額外襲擊: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的襲擊機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().map(p => p.seatNumber),
            getButtons: () => [{ id: 'kill', text: '額外襲擊', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const finalTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'poison', p.seatNumber) : parseInt(target);
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.killed = ctx.nightTags.killed || [];
                ctx.nightTags.killed.push(finalTarget);
                return `【額外襲擊: ${target}號】`;
            }
        }
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
        const act = actions.find(a => a.player.role === '女巫');
        if (!act) return "跳過行動"; 
        if (!ctx.witchState) ctx.witchState = {};
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'save' && !ctx.witchState.antidoteUsed) {
            if (ctx.nightTags?.killed?.length > 0) {
                const victim = ctx.nightTags.killed[0];
                if (victim === act.player.seatNumber) {
                    if (ctx.rules.witchSave === 'never') return "【無效行動】違反不可自救規則";
                    if (ctx.rules.witchSave === 'first_night' && ctx.nightCount > 1) return "【無效行動】違反僅首夜可自救規則";
                } 
                ctx.witchState.savedSeat = victim; 
                ctx.witchState.silverWater = victim; 
                ctx.nightTags.witchUsedSaveTonight = true;
                ctx.witchState.antidoteUsed = true;
                act.player.data.customSideTags = act.player.data.customSideTags || {};
                act.player.data.customSideTags[victim] = "銀水";
                return "使用解藥";
            }
            return "使用解藥";
        } else if (act.actionId === 'poison' && !ctx.witchState.poisonUsed && !ctx.nightTags?.witchUsedSaveTonight) {
            if (!ctx.witchState.antidoteUsed && ctx.nightTags?.killed?.length > 0 && target === ctx.nightTags.killed[0]) {
                return "解藥尚未使用時，不可毒殺被襲擊者。";
            }
            if (target) {
                const finalTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'poison', act.player.seatNumber) : parseInt(target);
                ctx.nightTags.poisoned.push(finalTarget);
                ctx.witchState.poisonUsed = true;
                ctx.nightTags.poisonerSeat = act.player.seatNumber;
                return `毒殺${target}號玩家`;
            }
            return "跳過行動";
        }
        return "跳過行動";
    },
    exportedSkills: {
        maid: {
            actionType: "dynamic_buttons",
            getPrompt: (ctx, mySeat) => {
                const victim = ctx.nightTags?.killed?.length > 0 ? ctx.nightTags.killed[0] : "無";
                return `【吞噬技能: 女巫】昨晚被狼人襲擊的是 ${victim} 號。\n請選擇要發動的技能：`;
            },
            getSelectableSeats: (ctx, mySeat) => {
                const p = ctx.getPlayer(mySeat);
                if (p.data.maidWitchState?.antidoteUsed && p.data.maidWitchState?.poisonUsed) return [];
                return ctx.getAlivePlayers().map(x => x.seatNumber);
            },
            getButtons: (ctx, mySeat) => {
                const p = ctx.getPlayer(mySeat);
                let btns = [];
                const victim = ctx.nightTags?.killed?.length > 0 ? ctx.nightTags.killed[0] : null;
                let canSave = !(p.data.maidWitchState?.antidoteUsed);
                if (canSave && victim === mySeat) {
                    if (ctx.rules.witchSave === 'never') canSave = false;
                    if (ctx.rules.witchSave === 'first_night' && ctx.nightCount > 1) canSave = false;
                }
                if (canSave) btns.push({ id: 'save', text: '使用解藥', requiresTarget: false });
                if (!(p.data.maidWitchState?.poisonUsed) && !(ctx.nightTags?.witchUsedSaveTonight)) btns.push({ id: 'poison', text: '使用毒藥', requiresTarget: true });
                btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
                return btns;
            },
            getPreSelectedTarget: (ctx, mySeat) => {
                const p = ctx.getPlayer(mySeat);
                return (!(p.data.maidWitchState?.antidoteUsed) && ctx.nightTags?.killed?.length > 0) ? ctx.nightTags.killed[0] : null;
            },
            resolve: (ctx, act) => {
                const p = act.player;
                const target = act.targets?.[0];
                if (!p.data.maidWitchState) p.data.maidWitchState = {};
                
                if (act.actionId === 'save' && !p.data.maidWitchState.antidoteUsed) {
                    if (ctx.nightTags?.killed?.length > 0) {
                        const victim = ctx.nightTags.killed[0];
                        p.data.maidWitchState.savedSeat = victim; 
                        ctx.witchState = ctx.witchState || {};
                        ctx.witchState.savedSeat = victim; 
                        ctx.nightTags.witchUsedSaveTonight = true;
                        p.data.maidWitchState.antidoteUsed = true;
                        return "【使用解藥】";
                    }
                } else if (act.actionId === 'poison' && !p.data.maidWitchState.poisonUsed && !ctx.nightTags?.witchUsedSaveTonight) {
                    const finalTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'poison', p.seatNumber) : parseInt(target);
                    ctx.nightTags = ctx.nightTags || {};
                    ctx.nightTags.poisoned = ctx.nightTags.poisoned || [];
                    ctx.nightTags.poisoned.push(finalTarget);
                    p.data.maidWitchState.poisonUsed = true;
                    ctx.nightTags.poisonerSeat = p.seatNumber;
                    return `【毒殺: ${target}號】`;
                }
                return "【無效行動】";
            }
        },
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 毒藥】選擇毒殺目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'poison', text: '毒殺', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
                ctx.nightTags.poisoned.push(parseInt(target));
                return `【毒殺: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的毒藥機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().map(p => p.seatNumber),
            getButtons: () => [{ id: 'poison', text: '額外毒殺', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const finalTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'poison', p.seatNumber) : parseInt(target);
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.poisoned = ctx.nightTags.poisoned || [];
                ctx.nightTags.poisoned.push(finalTarget);
                return `【額外毒殺: ${target}號】`;
            }
        }
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
        const act = actions.find(a => a.player.role === '預言家');
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            const tPlayer = ctx.getPlayer(actualTarget);
            // 優先讀取掩護身分 (供機械狼偽裝使用)
            const alignment = ctx.getSeerAlignment(actualTarget);
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = alignment; // (燈影為 fakeAlignment)
            act.player.data.latestCheckResult = { seat: parseInt(target), alignment: alignment, isSeerAction: true, purifiesFox: true };
            act.player.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`; // (燈影為 fakeAlignment)
            return `查驗: ${target}號`;
        }
        return "跳過行動";
    },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 預言家】選擇查驗目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                const alignment = ctx.getSeerAlignment(actualTarget);
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true }; 
                p.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
                return `【查驗: ${target}號】`;
            }
        },
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 預言家】選擇查驗目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
                const alignment = ctx.getSeerAlignment(actualTarget);
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
                p.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
                return `【查驗: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的查驗機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '額外查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', p.seatNumber) : parseInt(target);
                const alignment = ctx.getSeerAlignment(actualTarget);
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
                p.data.tempPrivateMessage = (p.data.tempPrivateMessage ? p.data.tempPrivateMessage + "\n" : "") + `【增幅查驗】${target}號玩家是【${alignment}】。`;
                return `【額外查驗: ${target}號】`;
            }
        }
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
        const act = actions.find(a => a.player.role === '燈影預言家');
        if (!act) return "【跳過行動】";
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        if (act.actionId === 'confirm' && target) {
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            const tPlayer = ctx.getPlayer(actualTarget);
            const alignment = ctx.getSeerAlignment(actualTarget);
            let fakeAlignment = (alignment === "狼人") ? "好人" : "狼人";
            act.player.data.seerRecords = act.player.data.seerRecords || {};
            act.player.data.seerRecords[target] = fakeAlignment;
            act.player.data.latestCheckResult = { seat: parseInt(target), alignment: fakeAlignment, isSeerAction: true, purifiesFox: true };
            act.player.data.tempPrivateMessage = `${target}號玩家是【${fakeAlignment}】。`;
            return `查驗: ${target}號`;
        }
        return "跳過行動";
    }
});

RoleRegistry.register("平民", { canSelfExplode: false });
RoleRegistry.register("獵人", { 
    canSelfExplode: false,
    onPlayerDied: (ctx, player, reason) => { 
        if (['killed', 'voted', 'shot'].includes(reason)) {
            if (reason !== 'voted') {
                const isFeared = ctx.fearedSeat === player.seatNumber;
                const isDevoured = ctx.devouredSeat === player.seatNumber;
                const isDebuffed = ctx.nightTags?.scholarDebuffTarget === player.seatNumber;
                if (isFeared || isDevoured || isDebuffed) {
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】獵人 ${player.seatNumber} 號死亡，因恐懼/吞噬/削弱無法開槍。`);
                    }
                    return; 
                }
            }
            ctx.pendingHunter = player.seatNumber; 
        }
    },
});
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
    getPrompt: () => "選擇今晚的襲擊目標",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction,
    onPlayerDied: (ctx, player, reason) => { 
        if (['killed', 'voted', 'shot'].includes(reason)) {
            if (reason !== 'voted') {
                const isFeared = ctx.fearedSeat === player.seatNumber;
                const isDebuffed = ctx.nightTags?.scholarDebuffTarget === player.seatNumber;
                if (isFeared || isDebuffed) {
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】狼王 ${player.seatNumber} 號死亡，但因受控(恐懼/削弱)無法開槍。`);
                    }
                    return; 
                }
            }
            ctx.pendingWolfKing = player.seatNumber; 
        }
    },
});

RoleRegistry.register("守衛", {
    canSelfExplode: false,
    nightPhase: "second_half",   
    actionType: "single_select",
    getPrompt: () => "選擇今晚守護的目標 (不可連續兩晚守護同一人)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().filter(p => p.seatNumber !== ctx.lastGuardedSeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'guard', text: '守護', requiresTarget: true }, { id: 'pass', text: '空守', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions.find(a => a.player.role === '守衛');
        if (!act || act.actionId === 'pass') {
            ctx.guardedSeat = null;
            if (act) act.player.data.lastGuardedSeat = null;
            return "【空守】";
        }
        const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
        ctx.guardedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'guard', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
        ctx.lastGuardedSeat = target;
        return `【守護: ${target}號】`;
    },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 守衛】選擇今晚守護的目標 (不可連續兩晚守護同一人)",
            getSelectableSeats: (ctx, mySeat) => {
                const p = ctx.getPlayer(mySeat);
                return ctx.getAlivePlayers().filter(x => x.seatNumber !== p.data.maidLastGuardedSeat).map(x => x.seatNumber);
            },
            getButtons: () => [{ id: 'guard', text: '守護', requiresTarget: true }, { id: 'pass', text: '空守', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                ctx.guardedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'guard', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                p.data.maidLastGuardedSeat = parseInt(target);
                return `【守護: ${target}號】`;
            }
        },
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 守衛】選擇強化守護目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'guard', text: '強化守護', requiresTarget: true }, { id: 'pass', text: '空守', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                act.player.data.mwGuardedSeat = parseInt(target); 
                return `【守護: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的守護機會無視連續守護限制",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().map(p => p.seatNumber),
            getButtons: () => [{ id: 'guard', text: '額外守護', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                p.data.scholarGuardedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'guard', p.seatNumber) : parseInt(target);
                return `【額外守護: ${target}號】`;
            }
        }
    }
});

RoleRegistry.register("白狼王", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: "midnight", actionType: "consensus",     
    getPrompt: () => "選擇今晚的襲擊目標",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: () => [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }],
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction,
    daySkill: {
        id: 'wwk_explode', buttonText: '自爆並帶走', requiresTarget: true,
        allowedPhases: ['SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'DAY_DISCUSSION', 'DAY_PK_SPEECH', 'PRINCE_SPEECH'],
        getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
        resolve: (ctx, player, targetSeat) => {
            if (ctx.pendingDawnDeaths) {
                const deathMap = ctx.pendingDawnDeaths;
                ctx.players.forEach(p => {
                    if (!p.isDead && deathMap[p.seatNumber]) p.kill(deathMap[p.seatNumber], ctx);
                });
                ctx.pendingDawnDeaths = null;
                ctx.interruptInitiator = null;
            }
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
            ctx.players.forEach(p => {
                if (p.data.isUntargetable && !p.isDead) {
                    if (ctx.nightCount >= p.data.expireNight) {
                        p.data.isUntargetable = false;
                        p.kill('skill_expired', ctx);
                        ctx.systemLog += `\n(系統紀錄：因白天提前結束，${p.seatNumber} 號白貓大限已至，跟隨倒牌出局)`;
                    }
                }
            });

            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            if (ctx.phase !== 'GAME_OVER') {
                ctx.daySkillLastWordsQueue = [player.seatNumber];
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
            player.isRevealed = true;
            ctx.systemLog = `${player.seatNumber} 號玩家是騎士，向${targetSeat} 號玩家發起決鬥。`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            if (typeof PhaseRegistry !== 'undefined' && PhaseRegistry.sm) {
                PhaseRegistry.sm.clearTimer();
            }
            if (ctx.currentSpeaker) {
                ctx.speakingQueue.unshift(ctx.currentSpeaker);
            }
            
            const isWolf = ctx.getDynamicFaction(targetPlayer) === 'wolf';
            if (ctx.pendingDawnDeaths) {
                const deathMap = ctx.pendingDawnDeaths;
                ctx.players.forEach(p => {
                    if (!p.isDead && deathMap[p.seatNumber]) p.kill(deathMap[p.seatNumber], ctx);
                });
                ctx.pendingDawnDeaths = null;
                ctx.interruptInitiator = null;
            }

            if (isWolf) {
                targetPlayer.kill('dueled', ctx);
                let extraLog = '';
                ctx.players.forEach(p => {
                    if (p.data.isUntargetable && !p.isDead) {
                        if (ctx.nightCount >= p.data.expireNight) {
                            p.data.isUntargetable = false;
                            p.kill('skill_expired', ctx);
                            extraLog += `\n(系統紀錄：因白天提前結束，${p.seatNumber} 號白貓大限已至，跟隨倒牌出局)`;
                        }
                    }
                });

                ctx.isResolvingAsync = true;
                setTimeout(() => {
                    try {
                        Engine.EventBus.emit('BROADCAST_MESSAGE', `決鬥結束，${targetSeat} 號玩家是狼人\n天黑請閉眼。` + extraLog);
                        Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                        if (ctx.phase !== 'GAME_OVER') {
                            ctx.destinationPhase = 'NIGHT_TRANSITION'; 
                            Engine.EventBus.emit('RESUME_ROUTINE');
                        }
                    } finally {
                        ctx.isResolvingAsync = false;
                    }
                }, 5000);
            } else {
                player.kill('dueled', ctx);
                ctx.isResolvingAsync = true;
                setTimeout(() => {
                    try {
                        Engine.EventBus.emit('BROADCAST_MESSAGE', `決鬥結束，${targetSeat} 號玩家是好人，決鬥失敗，請玩家繼續發言。`);
                        Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                        if (ctx.phase !== 'GAME_OVER') {
                            ctx.daySkillLastWordsQueue = [player.seatNumber];
                            ctx.destinationPhase = ctx.phase; 
                            Engine.EventBus.emit('RESUME_ROUTINE'); 
                        }
                    } finally {
                        ctx.isResolvingAsync = false;
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
    isAttacker: (ctx, mySeat) => {
        const step = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (step !== 'midnight') return false;
        const otherWolves = ctx.getAlivePlayers().filter(p => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0;
    },   
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
        if (step.phaseId === 'first_half') return "選擇今晚揭示具體身分的目標";
        return "選擇今晚的襲擊目標";
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
    isAttacker: (ctx, mySeat) => {
        const step = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (step !== 'midnight') return false;
        const otherWolves = ctx.getAlivePlayers().filter(p => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0;
    },
    onNightStart: (ctx, player) => {
        // [擴充：弱化1] 若規則設定為弱隱狼，直接中斷執行，失去看見隊友的功能
        if (ctx.rules?.hiddenWolfType === 'weak') return;

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
    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        // [擴充：弱化2] 任何玩家出局時，檢查弱隱狼是否孤立無援
        if (ctx.rules?.hiddenWolfType === 'weak' && !observer.isDead) {
            // 掃描場上是否還有其他活著的狼人陣營 (包含轉化者)
            const otherWolvesAlive = ctx.getAlivePlayers().filter(p => p.seatNumber !== observer.seatNumber && ctx.getDynamicFaction(p) === 'wolf');
            if (otherWolvesAlive.length === 0) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：狼隊隊友皆已出局，弱隱狼 ${observer.seatNumber} 號孤立無援，倒牌出局)`;
                // 觸發心碎/殉情機制，將連帶觸發引擎的勝負判定
                observer.kill('heartbreak', ctx);
            }
        }
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
    getPrompt: () => "選擇今晚的襲擊目標",
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
        ctx.cursedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'curse', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : target);
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
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half') return "選擇今晚恐懼的目標(不可連續恐懼同一人)";
        return "選擇今晚的襲擊目標";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        const p = ctx.getPlayer(mySeat);
        return ctx.getAlivePlayers()
            // [修復] 改為讀取自身專屬的 lastFearedSeat，防止被白天邏輯清空
            .filter(targetP => targetP.seatNumber !== mySeat && targetP.seatNumber !== p.data.lastFearedSeat) 
            .map(targetP => targetP.seatNumber); 
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
            // [新增] 若選擇跳過，清空自身紀錄
            if (act && phaseId === 'first_half') act.player.data.lastFearedSeat = null;
            return "【跳過行動】";
        }
        
        if (phaseId === 'first_half' && act.actionId === 'fear') {
            const target = act.targets[0];
            ctx.fearedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
            // [新增] 將紀錄精確寫入自身 data 中
            act.player.data.lastFearedSeat = parseInt(target);
            
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
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') return "選擇今晚的襲擊目標";
        return "選擇今晚的魅惑目標(不可連續魅惑同一人)";
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
            if (ctx.confusedSeats && ctx.confusedSeats.includes(act.player.seatNumber)) {
                return "【技能失效】被子狐迷惑";
            }
            
            const target = act.targets[0];
            ctx.charmedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            return `【魅惑: ${target}號】`;
        }
    },
    onPlayerDied: (ctx, player, reason) => {
        if (reason !== 'dueled' && reason !== 'silenthunted' && ctx.charmedSeat) {
            const target = ctx.getPlayer(ctx.charmedSeat);
            if (target && !target.isDead) target.kill('charmed', ctx);
        }
    },
});

RoleRegistry.register("攝夢人", {
    canSelfExplode: false,
    nightPhase: "second_half", 
    actionType: "single_select",
    getPrompt: () => "選擇今晚的夢遊者，連續夢遊將致死",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'dream', text: '攝夢', requiresTarget: true }],
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.isDead) return;
        if (ctx.dreamedSeat) {
            const dSeat = ctx.dreamedSeat;
            if (['killed', 'poisoned', 'skill_backfire', 'bloodlusted'].includes(deathMap[dSeat])) {
                delete deathMap[dSeat];   
            }
        }
        if (ctx.nightTags?.buffDreamedSeat) {
            const bdSeat = ctx.nightTags.buffDreamedSeat;
            if (['killed', 'poisoned', 'skill_backfire', 'bloodlusted'].includes(deathMap[bdSeat])) {
                delete deathMap[bdSeat];   
            }
        }
        calc.dreamed.forEach(targetSeat => {
            if (calc.lastDreamed.includes(targetSeat)) deathMap[targetSeat] = 'doubledreamed';
        });
        
        if (deathMap[player.seatNumber] && ctx.dreamedSeat && ctx.dreamerSeat === player.seatNumber) {
            deathMap[ctx.dreamedSeat] = 'doubledreamed'; 
        }
        if (deathMap[player.seatNumber] && ctx.nightTags?.buffDreamedSeat && ctx.dreamerSeat === player.seatNumber) {
            deathMap[ctx.nightTags.buffDreamedSeat] = 'doubledreamed'; 
        }
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions.find(a => a.player.role === '攝夢人');
        let target;
        
        if (act && act.actionId !== 'pass' && act.targets && act.targets.length > 0) {
            target = act.targets[0];
        } else {
            const swPlayer = ctx.players.find(p => p.role === '攝夢人' && !p.isDead);
            if (!swPlayer || ctx.devouredSeat === swPlayer.seatNumber) return "【無效行動】";
            
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== swPlayer.seatNumber).map(p => p.seatNumber);
            if (selectable.length > 0) {
                target = selectable[Math.floor(Math.random() * selectable.length)];
            }
        }
        
        if (target) {
            const doer = act ? act.player : ctx.players.find(p => p.role === '攝夢人' && !p.isDead);
            const actorSeat = doer ? doer.seatNumber : parseInt(target);
            ctx.dreamedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'dream', actorSeat) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            if (doer) ctx.dreamerSeat = doer.seatNumber;
            
            return `【攝夢: ${target}號】`;
        }
        
        return "【行動失敗】";
    },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 攝夢人】選擇攝夢目標 (不可選擇自己，不可跳過)",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(x => x.seatNumber !== mySeat).map(x => x.seatNumber),
            getButtons: () => [{ id: 'dream', text: '攝夢', requiresTarget: true }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                ctx.dreamedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'dream', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                ctx.dreamerSeat = p.seatNumber; 
                return `【攝夢: ${target}號】`;
            }
        },
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 攝夢人】選擇攝夢目標 (連續夢遊將致死)",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'dream', text: '攝夢', requiresTarget: true }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                act.player.data.mwDreamedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'dream', act.player.seatNumber) : parseInt(target);
                return `【攝夢: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的攝夢機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'dream', text: '額外攝夢', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'dream', p.seatNumber) : parseInt(target);
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.buffDreamedSeat = actualTarget;
                return `【額外攝夢: ${target}號】`;
            }
        }
    }
});

RoleRegistry.register("暗戀者", {
    faction: "good",
    type: "villager",      
    nightPhase: "first_half", 
    actionType: "single_select",
    nightPriority: 4,
    hasAction: (ctx) => ctx.nightCount === 1 && !ctx.crushTarget,
    getPrompt: (ctx) => "選擇你的暗戀對象",
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
    resolveNightAction: (ctx, actions) => {
        if (ctx.nightCount > 1 || ctx.crushTarget) return "【無效行動】";
        
        let target;
        const act = actions.find(a => a.actionId === 'crush');
        // [修復] 解除對未定義 mySeat 的依賴，標準化從 actions 獲取玩家實體
        const admirerPlayer = act ? act.player : ctx.players.find(p => p.role === '暗戀者' && !p.isDead);
        if (!admirerPlayer) return "【無效行動】";

        if (act && act.targets && act.targets.length > 0) {
            target = act.targets[0];
        } else {
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== admirerPlayer.seatNumber).map(p => p.seatNumber);
            if (selectable.length > 0) target = selectable[Math.floor(Math.random() * selectable.length)];
        }
        
        if (target) {
            ctx.crushTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
            ctx.admirerSeat = admirerPlayer.seatNumber; 
            
            admirerPlayer.data.absoluteVictoryTarget = ctx.crushTarget;
            admirerPlayer.data.customSideTags = admirerPlayer.data.customSideTags || {};
            admirerPlayer.data.customSideTags[target] = "暗戀對象";
            
            return `【暗戀: ${target}號】`;
        }
        
        return "【行動失敗】";
    },

    getAbsoluteVictoryFaction: (ctx, player) => {
        if (player.data.absoluteVictoryTarget) {
            const crushPlayer = ctx.getPlayer(player.data.absoluteVictoryTarget);
            if (crushPlayer) {
                if (crushPlayer.role === '邱比特' && ctx.lovers && ctx.lovers.length === 2) {
                    const l1 = ctx.getPlayer(ctx.lovers[0]);
                    const l2 = ctx.getPlayer(ctx.lovers[1]);
                    if (l1 && l2) {
                        const f1 = ctx.getDynamicFaction(l1);
                        const f2 = ctx.getDynamicFaction(l2);
                        if (f1 === f2) return f1;
                        return 'third_party';
                    }
                }
                return ctx.getDynamicFaction(crushPlayer);
            }
        }
        return 'good';
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
    getPrompt: () => "選擇今晚的襲擊目標",
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
    getPrompt: () => "選擇今晚揭示具體身分的目標",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [
        { id: 'confirm', text: '確認', requiresTarget: true }, 
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
            const act = actions.find(a => a.player.role === '魔鏡少女');
            if (!act) return "【跳過行動】";
            const target = act.targets && act.targets.length > 0 ? act.targets[0] : null;
            
            if (act.actionId === 'confirm' && target) {
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                const tPlayer = ctx.getPlayer(actualTarget);
                
                const exactRole = tPlayer.data.camouflageRole || tPlayer.role; 
                
                act.player.data.seerRecords = act.player.data.seerRecords || {};
                act.player.data.seerRecords[target] = exactRole;
                act.player.data.latestCheckResult = { seat: parseInt(target), alignment: exactRole, isSeerAction: true };
                act.player.data.tempPrivateMessage = `${target}號玩家的具體身分為【${exactRole}】。`;
                
                return `查驗: ${target}號`;
            }
            return "跳過行動";
        },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 魔鏡少女】選擇查驗目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                const tPlayer = ctx.getPlayer(actualTarget);
                const alignment = tPlayer.data.camouflageRole || tPlayer.role; 
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
                p.data.tempPrivateMessage = `${target}號玩家的具體身分為【${alignment}】。`;
                return `【查驗: ${target}號】`;
            }
        },
        machineWolf: {
            actionType: "single_select",
            getPrompt: () => "【技能: 魔鏡少女】選擇查驗目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
                const tPlayer = ctx.getPlayer(actualTarget);
                const alignment = tPlayer.data.camouflageRole || tPlayer.role; 
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
                p.data.tempPrivateMessage = `${target}號玩家的具體身分為【${alignment}】。`;
                return `【查驗: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的查驗機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '額外查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', p.seatNumber) : parseInt(target);
                const tPlayer = ctx.getPlayer(actualTarget);
                const alignment = tPlayer.data.camouflageRole || tPlayer.role; 
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[target] = alignment;
                p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
                p.data.tempPrivateMessage = (p.data.tempPrivateMessage ? p.data.tempPrivateMessage + "\n" : "") + `【增幅查驗】${target}號玩家的具體身分為【${alignment}】。`;
                return `【額外查驗: ${target}號】`;
            }
        }
    }
});

RoleRegistry.register("機械狼", {
    canSelfExplode: false,
    canSeeWolves: false, 
    seenAsWolf: false,
    nightPhase: ["first_half", "midnight", "second_half"],
    hasPostVoteSkill: true, 
    onPhaseChanged: (ctx, player, phase) => {
        if (phase === 'VOTE_RESULT_DISPLAY' && player.data.isUntargetable && !player.isDead) {
            if (ctx.nightCount >= player.data.expireNight) {
                player.data.isUntargetable = false;
                player.kill('skill_expired', ctx);
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：機械狼 ${player.seatNumber} 號大限已至，倒牌出局)`;
                if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            }
        }
    },
    onNightStart: (ctx, player) => {
        player.data.learnedThisNight = false;
        player.data.mwGuardedSeat = null;
        if (player.data.mwDreamedSeat) {
            player.data.mwLastDreamedSeat = player.data.mwDreamedSeat;
            player.data.mwDreamedSeat = null;
        }
    },
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.data.mwGuardedSeat) {
            const gSeat = ctx.getActualTarget ? ctx.getActualTarget(player.data.mwGuardedSeat) : player.data.mwGuardedSeat;
            if (calc.killed.includes(gSeat)) {
                if (calc.saved.includes(gSeat) || calc.guarded.includes(gSeat)) {
                    deathMap[gSeat] = 'killed'; 
                } else {
                    if (deathMap[gSeat] === 'killed') delete deathMap[gSeat];
                }
            }
            if (calc.poisoned.includes(gSeat)) {
                if (deathMap[gSeat] === 'poisoned') delete deathMap[gSeat];
            }
            player.data.mwGuardedSeat = null;
        }
        if (player.data.machineState === 1 && player.data.learnedRole === '河豚') {
            if (deathMap[player.seatNumber] === 'killed' && ctx.nightTags?.clawKilled !== player.seatNumber) {
                player.isRevealed = true;
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：機械狼遭到狼人擊殺，發動河豚技能翻牌自證)`;
            }
        }
        if (player.data.machineState === 1 && player.data.learnedRole === '攝夢人') {
            if (player.data.mwDreamedSeat) {
                const mdSeat = player.data.mwDreamedSeat;
                if (['killed', 'poisoned', 'skill_backfire', 'bloodlusted'].includes(deathMap[mdSeat])) {
                    delete deathMap[mdSeat];
                }
            }
            if (deathMap[player.seatNumber] && player.data.mwDreamedSeat) {
                deathMap[player.data.mwDreamedSeat] = 'doubledreamed';
            }
        }
    },
    isAttacker: false,
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        const state = p.data.machineState || 0;

        if (step === 'first_half') return state === 0; 
        if (step === 'midnight') {
            const otherWolves = ctx.getAlivePlayers().filter(p => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
            return otherWolves.length === 0;
        }
        if (step === 'second_half') {
            if (state === 1 && !p.data.learnedThisNight) {
                const plugin = RoleRegistry.plugins[p.data.learnedRole];
                return !!(plugin?.exportedSkills?.machineWolf);
            }
        }
        return false;
    },
    actionType: (ctx, mySeat) => {
        const step = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (step === 'second_half') {
            const p = ctx.getPlayer(mySeat);
            const plugin = RoleRegistry.plugins[p.data.learnedRole];
            if (plugin?.exportedSkills?.machineWolf) {
                const type = plugin.exportedSkills.machineWolf.actionType;
                return typeof type === 'function' ? type(ctx, mySeat) : type;
            }
        }
        return "single_select";
    },
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "選擇今晚的襲擊目標";
        if (step === 'first_half') return "選擇學習的目標";
        
        const p = ctx.getPlayer(mySeat);
        const plugin = RoleRegistry.plugins[p.data.learnedRole];
        if (plugin?.exportedSkills?.machineWolf) {
            return plugin.exportedSkills.machineWolf.getPrompt(ctx, mySeat);
        }
        return "等待中...";
    },
    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        if (step === 'first_half') return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);

        const p = ctx.getPlayer(mySeat);
        const plugin = RoleRegistry.plugins[p.data.learnedRole];
        if (plugin?.exportedSkills?.machineWolf) {
            return plugin.exportedSkills.machineWolf.getSelectableSeats(ctx, mySeat);
        }
        return [];
    },
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return [{ id: 'kill', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        if (step === 'first_half') return [{ id: 'learn', text: '學習', requiresTarget: true }];
        
        const p = ctx.getPlayer(mySeat);
        const plugin = RoleRegistry.plugins[p.data.learnedRole];
        if (plugin?.exportedSkills?.machineWolf) {
            return plugin.exportedSkills.machineWolf.getButtons(ctx, mySeat);
        }
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

        if (step === 'first_half') {
            if (act.actionId === 'pass') return "【跳過行動】";
            const target = act.targets[0];
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

        if (step === 'second_half' && (p.data.machineState || 0) === 1) {
            if (act.actionId === 'pass') return "【跳過行動】";
            const plugin = RoleRegistry.plugins[p.data.learnedRole];
            if (plugin?.exportedSkills?.machineWolf) {
                const result = plugin.exportedSkills.machineWolf.resolve(ctx, act);
                p.data.machineState = 2; 
                return result;
            }
        }
        return "【無效行動】";
    },
    onPlayerDied: (ctx, player, reason) => {
        if (player.data.machineState === 1 && player.data.learnedRole === '獵人' && ['killed', 'voted', 'shot'].includes(reason)) {
            ctx.pendingWolfKing = player.seatNumber;
            player.data.machineState = 2;
        }

        if (player.data.machineState === 1 && player.data.learnedRole === '白貓' && !player.data.hasTriggeredSurvive && reason !== 'skill_expired') {
            player.isDead = false;
            player.isRevealed = true;
            player.data.hasTriggeredSurvive = true;
            player.data.isUntargetable = true;
            const isAfterVote = ['DAY_VOTING', 'DAY_PK_VOTING', 'VOTE_RESULT_DISPLAY', 'LAST_WORDS', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'BLOODMOON_ACTION'].includes(ctx.phase);
            player.data.expireNight = ctx.nightCount + (isAfterVote ? 1 : 0);
            ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：機械狼 ${player.seatNumber} 號受到致命傷，發動白貓技能翻牌並續命至下一次放逐投票後)`;
            player.data.machineState = 2; 
            return true;
        }
    },
    daySkill: {
        id: 'mw_pufferfish_blow', 
        buttonText: '翻牌發動反傷', 
        requiresTarget: false,
        allowDead: true,
        allowedPhases: ['POST_VOTE_SKILL'],
        getSelectableSeats: () => [],
        resolve: (ctx, player) => {
            if (player.data.machineState !== 1 || player.data.learnedRole !== '河豚') return;
            
            player.isRevealed = true;
            player.data.machineState = 2; 
            const targets = ctx.dailyVotes ? (ctx.dailyVotes[player.seatNumber] || []) : [];
            
            if (targets.length === 0) {
                ctx.systemLog = `${player.seatNumber} 號玩家是機械狼，翻牌發動河豚爆炸。\n但當天沒有任何人投票給他，無事發生。`;
                if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
                return;
            }
            
            let killedSeats = [];
            targets.forEach(seat => {
                const t = ctx.getPlayer(seat);
                if (t && !t.isDead) {
                    t.kill('shot', ctx); 
                    killedSeats.push(seat);
                }
            });
            
            ctx.systemLog = `${player.seatNumber} 號玩家是機械狼，翻牌發動河豚爆炸\n炸死了曾投票給他的：${killedSeats.join('、')} 號玩家。`;
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            }
        }
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
    getPrompt: () => "選擇今晚的交易對象\n交易到狼人將遭受反噬",
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
        const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'gift', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : target);
        const tPlayer = ctx.getPlayer(actualTarget);
        
        p.data.hasTraded = true;
        const isWolf = ctx.getDynamicFaction(tPlayer) === 'wolf';
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
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            const tPlayer = ctx.getPlayer(actualTarget);
            const alignment = ctx.getSeerAlignment(actualTarget);

            p.data.seerRecords = p.data.seerRecords || {};
            p.data.seerRecords[target] = alignment;
            p.data.latestCheckResult = { seat: target, alignment: alignment, isSeerAction: true, purifiesFox: true };
            p.data.tempPrivateMessage = `${target}號玩家是【${alignment}】。`;
            
            return `【查驗: ${target}號】`;
        }

        if (skill === '毒藥' && act.actionId === 'poison') {
            if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
            const finalTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'poison', act.player.seatNumber) : parseInt(target);
            ctx.nightTags.poisoned.push(finalTarget);
            ctx.nightTags.poisonerSeat = p.seatNumber; 
            return `【毒殺: ${target}號】`;
        }

        if (skill === '守護' && act.actionId === 'guard') {
            p.data.luckyGuardedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'guard', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            return `【守護: ${target}號】`;
        }
    }
});

RoleRegistry.register("魔術師", {
    canSelfExplode: false,
    nightPhase: "first_half",
    actionType: "double_select",
    nightPriority: 1,
    onNightStart: (ctx, player) => {
        player.data.usedMagicianTargets = player.data.usedMagicianTargets || [];
    },
    getPrompt: () => "選擇交換兩位玩家的號碼\n被交換過的號碼無法再被選擇",
    getSelectableSeats: (ctx, mySeat) => {
        const used = ctx.getPlayer(mySeat).data.usedMagicianTargets || [];
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
            deathMap[t] = 'claw_killed'; 
            if (!ctx.nightTags.clawLogWritten) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：狼鴉之爪發動技能，無視防禦擊殺 ${t} 號)`;
                ctx.nightTags.clawLogWritten = true;
            }
        }
    }
});

RoleRegistry.register("血月使徒", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: "midnight",      
    actionType: "consensus",
    suppressWolfDeathTick: (ctx, player, reason) => {
        return reason !== 'voted';
    },
    onPlayerDied: (ctx, player, reason) => {
        if (reason === 'voted') ctx.bloodMoonSeat = player.seatNumber;
    },
    onSelfExplode: (ctx, player) => {
        ctx.bloodMoonSilenceNight = ctx.nightCount + 1;
    },
    getPrompt: () => "選擇今晚的襲擊目標",
    getSelectableSeats: RoleRegistry.plugins["狼人"].getSelectableSeats,
    getButtons: RoleRegistry.plugins["狼人"].getButtons,
    resolveNightAction: RoleRegistry.plugins["狼人"].resolveNightAction
});
RoleRegistry.register("獵魔人", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (calc.poisoned.includes(player.seatNumber)) {
            calc.poisoned = calc.poisoned.filter(s => s !== player.seatNumber);

            if (calc.killed.includes(player.seatNumber)) {
                const isGuarded = calc.guarded.includes(player.seatNumber);
                const isSaved = calc.saved.includes(player.seatNumber);
                
                if ((isGuarded && isSaved) || (!isGuarded && !isSaved)) {
                    deathMap[player.seatNumber] = 'killed'; 
                    return; 
                }
            }
            
            if (deathMap[player.seatNumber] === 'poisoned') {
                delete deathMap[player.seatNumber];
            }
        }
    },
    hasAction: (ctx) => ctx.nightCount >= 2,
    getPrompt: () => "選擇今晚的狩獵目標",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'hunt', text: '狩獵', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        let logs = [];
        actions.forEach(act => {
            if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
                logs.push(`【${act.player.seatNumber}號 跳過行動】`);
                return;
            }

            const target = act.targets[0];
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'hunt', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : target);
            if (ctx.nightServantSeat === actualTarget) {
                logs.push(`【${act.player.seatNumber}號 狩獵: ${target}號 (夜僕，免疫狩獵且解除夜僕狀態)】`);

                ctx.nightServantSeat = null;
                ctx.nightServantExpireNight = null;
                ctx.players.forEach(p => {
                    if (p.data.customSideTags && p.data.customSideTags[actualTarget] === "夜僕") {
                        delete p.data.customSideTags[actualTarget];
                    }
                });
                return;
            }

            const tPlayer = ctx.getPlayer(actualTarget);
            const isWolf = ctx.getDynamicFaction(tPlayer) === 'wolf';

            if (isWolf) {
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.demonHunterKills = ctx.nightTags.demonHunterKills || [];
                ctx.nightTags.demonHunterKills.push(actualTarget);
                logs.push(`【${act.player.seatNumber}號 狩獵: ${target}號 (狼人)】`);
            } else {
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.demonHunterBackfires = ctx.nightTags.demonHunterBackfires || [];
                ctx.nightTags.demonHunterBackfires.push(act.player.seatNumber);
                logs.push(`【${act.player.seatNumber}號 狩獵: ${target}號 (好人，遭受反噬)】`);
            }
        });
        return logs.join('\n');
    },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 獵魔人】選擇狩獵目標 (狩獵好人自身死亡，狩獵狼人目標死亡)",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(x => x.seatNumber !== mySeat).map(x => x.seatNumber),
            getButtons: () => [{ id: 'hunt', text: '狩獵', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'hunt', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                const tPlayer = ctx.getPlayer(actualTarget);
                const isWolf = ctx.getDynamicFaction(tPlayer) === 'wolf';
                if (isWolf) {
                    ctx.nightTags = ctx.nightTags || {};
                    ctx.nightTags.demonHunterKills = ctx.nightTags.demonHunterKills || [];
                    ctx.nightTags.demonHunterKills.push(actualTarget);
                    return `【狩獵: ${target}號 (狼人)】`;
                } else {
                    ctx.nightTags = ctx.nightTags || {};
                    ctx.nightTags.demonHunterBackfires = ctx.nightTags.demonHunterBackfires || [];
                    ctx.nightTags.demonHunterBackfires.push(p.seatNumber);
                    return `【狩獵: ${target}號 (好人，遭受反噬)】`;
                }
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的狩獵機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'hunt', text: '額外狩獵', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'hunt', p.seatNumber) : parseInt(target);
                const tPlayer = ctx.getPlayer(actualTarget);
                const isWolf = ctx.getDynamicFaction(tPlayer) === 'wolf';

                ctx.nightTags = ctx.nightTags || {};
                if (isWolf) {
                    ctx.nightTags.demonHunterKills = ctx.nightTags.demonHunterKills || [];
                    ctx.nightTags.demonHunterKills.push(actualTarget);
                    return `【額外狩獵: ${target}號 (狼人)】`;
                } else {
                    ctx.nightTags.demonHunterBackfires = ctx.nightTags.demonHunterBackfires || [];
                    ctx.nightTags.demonHunterBackfires.push(p.seatNumber);
                    return `【額外狩獵: ${target}號 (好人，遭受反噬)】`;
                }
            }
        }
    }
});
RoleRegistry.register("熊", {
    canSelfExplode: false
});

RoleRegistry.register("河豚", {
    canSelfExplode: false,
    hasPostVoteSkill: true,
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (deathMap[player.seatNumber] === 'killed' && ctx.nightTags?.clawKilled !== player.seatNumber) {
            player.isRevealed = true;
            let logMsg = `\n(系統紀錄：河豚遭到狼人擊殺，翻牌自證`;
            let hasNullified = false;

            if (ctx.charmedSeat) {
                ctx.charmedSeat = null;
                hasNullified = true;
            }
            if (ctx.dirgedSeat) {
                ctx.players.forEach(p => {
                    if (p.data.customSideTags && p.data.customSideTags[ctx.dirgedSeat] === "輓歌") {
                        delete p.data.customSideTags[ctx.dirgedSeat];
                    }
                });
                ctx.dirgedSeat = null;
                hasNullified = true;
            }
            
            logMsg += hasNullified ? `，並使狼隊的魅惑與輓歌失效)` : `)`;
            ctx.systemLog = (ctx.systemLog || '') + logMsg;
        }
    },
    daySkill: {
        id: 'pufferfish_blow', 
        buttonText: '翻牌發動反傷', 
        requiresTarget: false,
        allowDead: true,
        allowedPhases: ['POST_VOTE_SKILL'],
        getSelectableSeats: () => [],
        resolve: (ctx, player) => {
            player.isRevealed = true;
            const targets = ctx.dailyVotes ? (ctx.dailyVotes[player.seatNumber] || []) : [];
            
            if (targets.length === 0) {
                ctx.systemLog = `${player.seatNumber} 號玩家是河豚，翻牌發動河豚爆炸。\n但當天沒有任何人投票給他，無事發生。`;
                if (typeof Engine !== 'undefined' && Engine.EventBus) Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
                return;
            }
            
            let killedSeats = [];
            targets.forEach(seat => {
                const t = ctx.getPlayer(seat);
                if (t && !t.isDead) {
                    t.kill('shot', ctx); 
                    killedSeats.push(seat);
                }
            });
            
            ctx.systemLog = `${player.seatNumber} 號玩家是河豚，翻牌發動河豚爆炸\n炸死了曾投票給他的：${killedSeats.join('、')} 號玩家。`;
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            }
        }
    }
});
RoleRegistry.register("尋香魅影", {
    canSelfExplode: false,
    canSeeWolves: false,
    seenAsWolf: false,
    isAttacker: false,        
    hasWolfChatAccess: false,
    nightPhase: ["midnight", "second_half"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'single_select' : 'double_select',
    onNightStart: (ctx, player) => {
        if (player.data.phantomLinkNight && ctx.nightCount > player.data.phantomLinkNight) {
            player.data.phantomLinked = [];
        }
        if (ctx.nightCount === 1 && !player.data.knownWolf) {
            const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== player.seatNumber);
            if (otherWolves.length > 0) {
                const randomWolf = otherWolves[Math.floor(Math.random() * otherWolves.length)];
                player.data.knownWolf = randomWolf.seatNumber;
                player.data.customTopTags = player.data.customTopTags || {};
                player.data.customTopTags[randomWolf.seatNumber] = '狼人';
            }
        }
    },
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const player = ctx.getPlayer(mySeat);
        if (step === 'midnight') {
            const otherWolves = ctx.getAlivePlayers().filter(p => ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
            return otherWolves.length === 0;
        }
        if (step === 'second_half') {
            return !player.data.phantomTriggered;
        }
        return false;
    },
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "其他狼同伴皆已出局\n請選擇今晚的襲擊目標 (或跳過以空刀)";
        
        const known = ctx.getPlayer(mySeat).data.knownWolf;
        const knownStr = known ? `(已知狼同伴: ${known}號)\n` : "";
        return `${knownStr}請選擇兩名玩家進行連繫\n(其中一人出局，另一人將殉情。成功觸發後技能失效)`;
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence[ctx.currentNightStepIndex].phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers().map(p => p.seatNumber);
    },
    getButtons: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') {
            return [{ id: 'kill', text: '襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        }
        return [
            { id: 'link', text: '連繫', requiresTarget: true },
            { id: 'pass', text: '不發動', requiresTarget: false }
        ];
    },
    resolveNightAction: (ctx, actions) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        let logs = [];
        if (step === 'midnight') {
            actions.forEach(act => {
                if (!act || act.actionId === 'pass') {
                    logs.push(`【${act.player.seatNumber}號 空刀】`);
                    return;
                }
                const target = act.targets[0];
                if (!ctx.nightTags) ctx.nightTags = { killed: [], poisoned: [] };
                ctx.nightTags.killed.push(parseInt(target));
                logs.push(`【${act.player.seatNumber}號 襲擊: ${target}號】`);
            });
            return logs.join('\n');
        }

        if (step === 'second_half') {
            actions.forEach(act => {
                const player = act.player;
                if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
                    player.data.phantomLinked = [];
                    logs.push(`【${player.seatNumber}號 不發動技能】`);
                    return;
                }
                const t1 = parseInt(act.targets[0]);
                const t2 = act.targets.length > 1 ? parseInt(act.targets[1]) : t1;
                
                player.data.phantomLinked = [t1, t2];
                player.data.phantomLinkNight = ctx.nightCount;
                logs.push(`【${player.seatNumber}號 連繫: ${t1}號 與 ${t2}號】`);
            });
            return logs.join('\n');
        }
    },
    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (observer.data.phantomLinked && observer.data.phantomLinked.includes(deadPlayer.seatNumber) && !observer.data.phantomTriggered) {
            const otherSeat = observer.data.phantomLinked.find(s => s !== deadPlayer.seatNumber);
            if (otherSeat) {
                const otherPlayer = ctx.getPlayer(otherSeat);
                if (otherPlayer && !otherPlayer.isDead) {
                    observer.data.phantomTriggered = true;
                    ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：尋香魅影連繫生效，${otherSeat} 號玩家殉情出局)`;
                    otherPlayer.kill('martyr', ctx);
                }
            }
        }
    },
});
RoleRegistry.register("覺醒預言家", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "double_select",
    isSeer: true,
    getPrompt: () => "選擇今晚的兩名查驗目標\n(包含自己，可重複選擇)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [
        { id: 'check', text: '查驗', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
            return "【跳過行動】";
        }
        
        const t1 = parseInt(act.targets[0]);
        const t2 = act.targets.length > 1 ? parseInt(act.targets[1]) : t1;
        const checkAlignment = (target) => {
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
            return ctx.getSeerAlignment(actualTarget);
        };

        const align1 = checkAlignment(t1);
        const align2 = checkAlignment(t2);
        let finalResult = "好人";
        if (align1 === "狼人" || align2 === "狼人") {
            finalResult = "疑似狼人";
        }
        act.player.data.seerRecords = act.player.data.seerRecords || {};
        act.player.data.seerRecords[t1] = finalResult;
        act.player.data.seerRecords[t2] = finalResult;
        
        act.player.data.latestCheckResult = { seat: t1, seat2: t2, alignment: finalResult, isSeerAction: true, purifiesFox: true };
        if (t1 === t2) {
            act.player.data.tempPrivateMessage = `${t1}號 的查驗結果為：【${align1}】。`;
        } else {
            act.player.data.tempPrivateMessage = `${t1}號與${t2}號 的查驗結果為：【${finalResult}】。`;
        }
        
        return `查驗: ${t1}號, ${t2}號`;
    },
    exportedSkills: {
        maid: {
            actionType: "double_select",
            getPrompt: () => "【吞噬技能: 覺醒預言家】選擇兩名查驗目標",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().map(x => x.seatNumber),
            getButtons: () => [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const p = act.player;
                const t1 = parseInt(act.targets[0]);
                const t2 = act.targets.length > 1 ? parseInt(act.targets[1]) : t1;
                const checkAlignment = (tgt) => {
                    const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(tgt, 'check', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(tgt) : parseInt(tgt));
                    return ctx.getSeerAlignment(actualTarget);
                };
                const align1 = checkAlignment(t1);
                const align2 = checkAlignment(t2);
                let finalResult = "好人";
                if (align1 === "狼人" || align2 === "狼人") finalResult = "疑似狼人";
                
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[t1] = finalResult;
                p.data.seerRecords[t2] = finalResult;
                p.data.latestCheckResult = { seat: t1, seat2: t2, alignment: finalResult, isSeerAction: true, purifiesFox: true };
                if (t1 === t2) p.data.tempPrivateMessage = `${t1}號 的查驗結果為：【${align1}】。`;
                else p.data.tempPrivateMessage = `${t1}號與${t2}號 的查驗結果為：【${finalResult}】。`;
                return `【查驗: ${t1}號, ${t2}號】`;
            }
        },
        buff: {
            actionType: "double_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的雙查驗機會",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().map(p => p.seatNumber),
            getButtons: () => [{ id: 'check', text: '額外查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const p = act.player;
                const t1 = parseInt(act.targets[0]);
                const t2 = act.targets.length > 1 ? parseInt(act.targets[1]) : t1;
                const checkAlignment = (tgt) => {
                    const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(tgt, 'check', p.seatNumber) : parseInt(tgt);
                    return ctx.getSeerAlignment(actualTarget);
                };

                const align1 = checkAlignment(t1);
                const align2 = checkAlignment(t2);
                let finalResult = "好人";
                if (align1 === "狼人" || align2 === "狼人") finalResult = "疑似狼人";
                
                p.data.seerRecords = p.data.seerRecords || {};
                p.data.seerRecords[t1] = finalResult;
                p.data.seerRecords[t2] = finalResult;
                
                p.data.latestCheckResult = { seat: t1, seat2: t2, alignment: finalResult, isSeerAction: true, purifiesFox: true };
                const msg = t1 === t2 ? `${t1}號 的查驗結果為：【${align1}】。` : `${t1}號與${t2}號 的查驗結果為：【${finalResult}】。`;
                p.data.tempPrivateMessage = (p.data.tempPrivateMessage ? p.data.tempPrivateMessage + "\n" : "") + `【增幅查驗】${msg}`;
                return `【額外查驗: ${t1}號, ${t2}號】`;
            }
        }
    }
});
RoleRegistry.register("子狐", {
    canSelfExplode: false,
    nightPhase: "first_half",
    nightPriority: 99,
    actionType: "single_select",
    hasAction: (ctx, mySeat) => {
        return !ctx.getPlayer(mySeat).data.hasConfused;
    },
    getPrompt: () => "選擇迷惑目標 (全局限用一次)\n若迷惑到狼人，狼隊當晚無法襲擊",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [
        { id: 'confuse', text: '迷惑', requiresTarget: true },
        { id: 'pass', text: '不發動', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        let logs = [];
        actions.forEach(act => {
            if (!act || act.actionId === 'pass') {
                logs.push(`【${act.player.seatNumber}號 保留技能】`);
                return;
            }
            const target = act.targets[0];
            act.player.data.hasConfused = true;

            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
            const isWolf = ROLE_DICTIONARY[checkRole]?.faction === 'wolf';

            if (isWolf) {
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.wolfTeamConfused = true;
                ctx.confusedSeats = ctx.confusedSeats || [];
                ctx.confusedSeats.push(actualTarget);
                logs.push(`【${act.player.seatNumber}號 迷惑: ${target}號 (狼人，封印技能與襲擊)】`);
            } else {
                logs.push(`【${act.player.seatNumber}號 迷惑: ${target}號 (好人，無效)】`);
            }
        });
        return logs.join('\n');
    }
});
RoleRegistry.register("白貓", {
    canSelfExplode: false,
    onPhaseChanged: (ctx, player, phase) => {
        if (phase === 'VOTE_RESULT_DISPLAY' && player.data.isUntargetable && !player.isDead) {
            if (ctx.nightCount >= player.data.expireNight) {
                player.data.isUntargetable = false;
                player.kill('skill_expired', ctx);
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：白貓 ${player.seatNumber} 號大限已至，倒牌出局)`;
                Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
            }
        }
    },
    onPlayerDied: (ctx, player, reason) => {
        if (!player.data.hasTriggeredSurvive && reason !== 'skill_expired') {
            player.isDead = false;
            player.isRevealed = true;
            player.data.hasTriggeredSurvive = true;
            player.data.isUntargetable = true;
            const isAfterVote = ['DAY_VOTING', 'DAY_PK_VOTING', 'VOTE_RESULT_DISPLAY', 'LAST_WORDS', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'BLOODMOON_ACTION'].includes(ctx.phase);
            player.data.expireNight = ctx.nightCount + (isAfterVote ? 1 : 0);
            ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：白貓 ${player.seatNumber} 號受到致命傷，翻牌並續命至下一次放逐投票後)`;
            return true; // 攔截本次死亡結算
        }
        return false;
    }
});
RoleRegistry.register("蝕時狼妃", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: true,
    nightPriority: 2,
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    hasWolfChatAccess: true,
    nightPhase: ["first_half", "midnight"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half' ? 'single_select' : 'consensus',
    onNightStart: (ctx, player) => {
        player.data.usedSealTargets = player.data.usedSealTargets || [];
    },
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        if (step === 'first_half') return !p.data.sealPermanentlyLost;
        return true; 
    },
    getPrompt: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half') return "選擇今晚的封鎖目標\n封鎖過的目標不可再封鎖\n技能生效後將失去技能";
        return "選擇今晚的襲擊目標";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        const p = ctx.getPlayer(mySeat);
        const used = p.data.usedSealTargets || [];
        return ctx.getAlivePlayers().filter(p => !used.includes(p.seatNumber)).map(p => p.seatNumber);
    },
    getButtons: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        return [{ id: 'seal', text: '封鎖', requiresTarget: true }, { id: 'pass', text: '不發動', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const phaseId = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }

        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【保留技能】";

        const target = act.targets[0];
        act.player.data.usedSealTargets = act.player.data.usedSealTargets || [];
        act.player.data.usedSealTargets.push(parseInt(target));

        ctx.nightTags = ctx.nightTags || {};
        ctx.nightTags.sealerSeat = act.player.seatNumber;
        ctx.nightTags.sealedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        return `【封鎖: ${target}號】`;
    }
});
RoleRegistry.register("定序王子", {
    canSelfExplode: false,
    hasPostVoteSkill: true,
    nightPhase: "second_half",
    actionType: "single_select",
    onNightStart: (ctx, player) => {
        // [修改] 拔除舊版遍歷歷史放逐紀錄的髒邏輯，判定已在白天技能發動時完成
    },
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.princeSanctioned) {
            const target = ctx.nightTags.princeSanctioned;
            deathMap[target] = 'purified'; 
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】定序王子發動制裁，擊殺 ${target} 號`);
            }
        }
    },
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return p.data.hasUsedDaySkill && !p.data.hasReceivedPrinceInfo;
    },
    getPrompt: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        if (p.data.savedTargetWasGood) {
            return `【被動技能】\n你發動技能救下的玩家為【好人】。\n你可以選擇制裁一名玩家 (無視防禦擊殺)：`;
        }
        return `【被動技能】\n你發動技能救下的玩家為【狼人】(或當日無人被放逐出局)。`;
    },
    getSelectableSeats: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        if (p.data.savedTargetWasGood) {
            return ctx.getAlivePlayers().filter(x => x.seatNumber !== mySeat).map(x => x.seatNumber);
        }
        return [];
    },
    getButtons: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        if (p.data.savedTargetWasGood) {
            return [
                { id: 'sanction', text: '制裁', requiresTarget: true },
                { id: 'pass', text: '跳過', requiresTarget: false }
            ];
        }
        return [{ id: 'confirm', text: '確認', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【無效行動】";
        act.player.data.hasReceivedPrinceInfo = true;
        if (act.actionId === 'sanction' && act.targets && act.targets.length > 0) {
            const target = act.targets[0];
            const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'sanction', act.player.seatNumber) : parseInt(target);
            
            ctx.nightTags = ctx.nightTags || {};
            ctx.nightTags.princeSanctioned = actualTarget;
            
            return `【制裁: ${target}號】`;
        }

        if (act.actionId === 'pass') {
            return "【跳過制裁】";
        }

        return "【確認資訊】";
    },
    daySkill: {
        id: 'prince_reverse',
        buttonText: '翻牌定序',
        requiresTarget: false,
        allowDead: true,
        allowedPhases: ['POST_VOTE_SKILL'],
        getSelectableSeats: () => [],
        resolve: (ctx, player) => {
            if (player.data.hasUsedDaySkill) return;

            player.isRevealed = true;
            player.data.hasUsedDaySkill = true; 
            player.data.savedTargetWasGood = false;
            
            if (ctx.votedOutToday) {
                const target = ctx.getPlayer(ctx.votedOutToday);
                if (target && target.isDead && target.deathReason === 'voted') {
                    player.data.savedTargetWasGood = (ctx.getDynamicFaction(target) !== 'wolf');
                    
                    target.isDead = false;
                    target.deathReason = null;
                    ctx.players.filter(p => p.role === '尋香魅影').forEach(phantom => {
                        if (phantom.data.phantomTriggered && phantom.data.phantomLinked && phantom.data.phantomLinked.includes(ctx.votedOutToday)) {
                            const otherSeat = phantom.data.phantomLinked.find(s => s !== ctx.votedOutToday);
                            const martyrPlayer = ctx.getPlayer(otherSeat);
                            if (martyrPlayer && martyrPlayer.isDead && martyrPlayer.deathReason === 'martyr') {
                                martyrPlayer.isDead = false;
                                martyrPlayer.deathReason = null;
                                phantom.data.phantomTriggered = false;
                            }
                        }
                    });
                    
                    ctx.lastWordsTargets = ctx.lastWordsTargets.filter(s => s !== ctx.votedOutToday);
                    if (target.role === '血月使徒') { ctx.bloodMoonSeat = null; ctx.pendingBloodMoon = null; }
                    if (target.role === '獵人') ctx.pendingHunter = null;
                    if (target.role === '狼王') ctx.pendingWolfKing = null;
                    if (target.role === '白貓' && target.data.hasTriggeredSurvive) {
                        target.data.hasTriggeredSurvive = false;
                        target.data.isUntargetable = false;
                    }
                }
            }
            
            ctx.votedOutToday = null;
            ctx.systemLog = `${player.seatNumber} 號玩家是定序王子，翻牌逆轉時光。\n本次放逐投票作廢，由定序王子發言後，重新投票。`;
            Engine.EventBus.emit('BROADCAST_MESSAGE', ctx.systemLog);
            
            ctx.dayDiscussionPrompt = `【定序王子發動技能】\n現在由 ${player.seatNumber} 號玩家進行額外發言`;
            ctx.buildSpeakingQueue(player.seatNumber, 1, [player.seatNumber]);
            
            ctx.destinationPhase = 'PRINCE_SPEECH';
            if (typeof PhaseRegistry !== 'undefined' && PhaseRegistry.sm) {
                PhaseRegistry.sm.transitionTo('PRINCE_SPEECH');
            }
        }
    }
});
RoleRegistry.register("純白之女", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    isSeer: true, 
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.pureWhiteKilled) {
            const target = ctx.nightTags.pureWhiteKilled;
            deathMap[target] = 'purified'; 
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】純白之女發動查殺，擊殺 ${target} 號`);
            }
        }
    },
    getPrompt: () => "選擇今晚揭示具體身分的目標",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [
        { id: 'check', text: '查驗', requiresTarget: true }, 
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        const target = act.targets[0];
        const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
        const tPlayer = ctx.getPlayer(actualTarget);
        
        const exactRole = tPlayer.data.camouflageRole || tPlayer.role; 
        
        act.player.data.seerRecords = act.player.data.seerRecords || {};
        act.player.data.seerRecords[target] = exactRole;
        act.player.data.latestCheckResult = { seat: parseInt(target), alignment: exactRole, isSeerAction: true };
        act.player.data.tempPrivateMessage = `${target}號玩家的具體身分為【${exactRole}】。`;
        if (ctx.nightCount >= 2 && ctx.getDynamicFaction(tPlayer) === 'wolf') {
            ctx.nightTags = ctx.nightTags || {};
            ctx.nightTags.pureWhiteKilled = actualTarget;
        }
        
        return `查驗: ${target}號`;
    }
});

RoleRegistry.register("狼巫", {
    canSelfExplode: false,
    canSeeWolves: true,
    seenAsWolf: true,
    immuneToWolfBite: true,
    hasWolfChatAccess: true,
    nightPhase: ["midnight", "second_half"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.wolfWitchKilled) {
            const target = ctx.nightTags.wolfWitchKilled;
            deathMap[target] = 'purified';
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】狼巫發動查殺，擊殺純白之女 ${target} 號`);
            }
        }
    },
    getPrompt: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') return "選擇今晚的襲擊目標";
        return "選擇今晚揭示具體身分的目標";
    },
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
    },
    getButtons: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        }
        return [{ id: 'check', text: '查驗', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const phaseId = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }
        
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        const target = act.targets[0];
        const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'check', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
        const tPlayer = ctx.getPlayer(actualTarget);
        
        const exactRole = tPlayer.data.camouflageRole || tPlayer.role; 
        
        act.player.data.seerRecords = act.player.data.seerRecords || {};
        act.player.data.seerRecords[target] = exactRole;
        act.player.data.latestCheckResult = { seat: parseInt(target), alignment: exactRole, isSeerAction: true };
        act.player.data.tempPrivateMessage = `${target}號玩家的具體身分為【${exactRole}】。`;
        
        if (ctx.nightCount >= 2 && exactRole === '純白之女') {
            ctx.nightTags = ctx.nightTags || {};
            ctx.nightTags.wolfWitchKilled = actualTarget;
        }
        
        return `查驗: ${target}號`;
    }
});
RoleRegistry.register("吹笛者", {
    canSelfExplode: false,
    nightPhase: "first_half", 
    actionType: (ctx) => {
        if (ctx.players.length < 12 && ctx.nightCount > 1) {
            return "single_select";
        }
        return "up_to_two";
    },
    checkWinCondition: (ctx, player) => {
        if (player.isDead) return null;
        const alive = ctx.getAlivePlayers();
        const piperCount = alive.filter(p => p.role === '吹笛者').length;
        const charmedAliveCount = alive.filter(p => ctx.charmedByPiper && ctx.charmedByPiper.includes(p.seatNumber)).length;
        if (alive.length - piperCount === charmedAliveCount) {
            return { winner: "第三方陣營 (吹笛者)", reason: "場上除了吹笛者以外的所有存活玩家皆已被誘引" };
        }
        return null;
    },

    onNightStart: (ctx, player) => {
        ctx.charmedByPiper = ctx.charmedByPiper || [];
    },

    getPrompt: (ctx) => {
        if (ctx.players.length < 12 && ctx.nightCount > 1) {
            return "選擇今晚誘引的目標 (0~1名玩家)\n(被誘引者將會互相確認彼此，但不知道吹笛者是誰)";
        }
        return "選擇今晚誘引的目標 (0~2名玩家)\n(被誘引者將會互相確認彼此，但不知道吹笛者是誰)";
    },
    getSelectableSeats: (ctx, mySeat) => {
        ctx.charmedByPiper = ctx.charmedByPiper || [];
        return ctx.getAlivePlayers()
            .filter(p => p.seatNumber !== mySeat && !ctx.charmedByPiper.includes(p.seatNumber))
            .map(p => p.seatNumber);
    },
    getButtons: () => [
        { id: 'delude', text: '確認誘引', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        ctx.charmedByPiper = ctx.charmedByPiper || [];
        
        if (act && act.actionId !== 'pass' && act.targets && act.targets.length > 0) {
            act.targets.forEach(t => {
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(t) : parseInt(t);
                if (!ctx.charmedByPiper.includes(actualTarget)) {
                    ctx.charmedByPiper.push(actualTarget);
                }
            });
        }
        if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) return "【跳過行動】";
        return `【誘引: ${act.targets.join('、')}號】`;
    }
});
RoleRegistry.register("不死鳥", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    allowDeadTarget: true,

    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount >= 2 && !p.data.hasResurrected;
    },
    getPrompt: () => "選擇是否要復活已死亡的玩家",
    getSelectableSeats: (ctx) => {
        return ctx.players.filter(p => p.isDead).map(p => p.seatNumber);
    },
    
    getButtons: () => [
        { id: 'resurrect', text: '復活', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        const target = act.player.data.tempDeadTarget || (act.targets && act.targets[0]);
        if (!target) return "【跳過行動】";
        
        act.player.data.hasResurrected = true;
        act.player.data.tempDeadTarget = null;
        
        ctx.nightTags = ctx.nightTags || {};
        ctx.nightTags.phoenixResurrectTarget = target;
        
        return `【復活: ${target}號】`;
    },
    
    onPhaseChanged: (ctx, player, phase) => {
        if (phase === 'DAWN_DEATH_ANNOUNCE' && ctx.nightTags?.phoenixResurrectTarget) {
            const targetSeat = ctx.nightTags.phoenixResurrectTarget;
            const targetPlayer = ctx.getPlayer(targetSeat);
            
            if (targetPlayer && targetPlayer.isDead) {
                targetPlayer.isDead = false;
                targetPlayer.deathReason = null;
                
                const exactRole = targetPlayer.data.camouflageRole || targetPlayer.role;
                const isWolf = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[exactRole]?.faction === 'wolf';
                
                if (isWolf) {
                    player.data.customTopTags = player.data.customTopTags || {};
                    player.data.customTopTags[targetSeat] = exactRole; 
                    
                    targetPlayer.data.customTopTags = targetPlayer.data.customTopTags || {};
                    targetPlayer.data.customTopTags[player.seatNumber] = '不死鳥';
                }
                
                player.data.phoenixLinked = targetSeat;
                
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】不死鳥發動技能，復活 ${targetSeat} 號`);
                }
                
                if (player.isDead) {
                    targetPlayer.kill('martyr', ctx);
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】因不死鳥已在昨夜死亡，剛復活的 ${targetSeat} 號玩家立刻殉情`);
                    }
                }
                
                ctx.nightTags.phoenixResurrectTarget = null;
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('CHECK_WIN_CONDITION', ctx);
                }
            }
        }
    },
    
    onPlayerDied: (ctx, player, reason) => {
        if (player.data.phoenixLinked) {
            const target = ctx.getPlayer(player.data.phoenixLinked);
            if (target && !target.isDead) {
                target.kill('martyr', ctx);
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】不死鳥出局，被復活的 ${target.seatNumber} 號玩家殉情`);
                }
            }
        }
    }
});

RoleRegistry.register("高級平民", {
    canSelfExplode: false,
    onPlayerDied: (ctx, player, reason) => {
        if (reason === 'voted') return false; 

        if (!player.data.hasAdvancedVillagerSaved) {
            player.isDead = false;
            player.deathReason = null;
            player.data.hasAdvancedVillagerSaved = true;
            
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】高級平民 ${player.seatNumber} 號受到致命傷 (${reason})，已消耗免死機會。`);
            }
            return true; 
        }
        return false;
    }
});
RoleRegistry.register("蝕日侍女", {
    canSelfExplode: true,
    canSeeWolves: true,
    seenAsWolf: false,
    hasWolfChatAccess: false,
    nightPhase: ["first_half", "midnight", "second_half"],
    nightPriority: 3,
    isAttacker: (ctx, mySeat) => {
        const step = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (step !== 'midnight') return false;
        const otherWolves = ctx.getAlivePlayers().filter(p => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[p.role]?.faction === 'wolf' && p.seatNumber !== mySeat);
        return otherWolves.length === 0;
    },
    actionType: (ctx, mySeat) => {
        const step = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (step === 'midnight') return 'consensus';
        if (step === 'second_half') {
            const p = ctx.getPlayer(mySeat);
            const plugin = RoleRegistry.plugins[p.data.devouredRole];
            if (plugin?.exportedSkills?.maid) {
                const type = plugin.exportedSkills.maid.actionType;
                return typeof type === 'function' ? type(ctx, mySeat) : type;
            }
        }
        return 'single_select';
    },
    onNightStart: (ctx, player) => {
        player.data.devouredThisNight = false;
        player.data.devouredRole = null;
        player.data.virtualRoles = [];
    },
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        
        if (step === 'first_half') return ctx.nightCount >= 2;
        if (step === 'midnight') {
            const otherWolves = ctx.getAlivePlayers().filter(x => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[x.role]?.faction === 'wolf' && x.seatNumber !== mySeat);
            return otherWolves.length === 0;
        }
        if (step === 'second_half') {
            if (p.data.devouredThisNight && p.data.devouredRole) {
                const plugin = RoleRegistry.plugins[p.data.devouredRole];
                if (plugin?.exportedSkills?.maid) {
                    if (plugin.exportedSkills.maid.hasAction) {
                        return plugin.exportedSkills.maid.hasAction(ctx, mySeat);
                    }
                    return true;
                }
            }
        }
        return false;
    },
    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'first_half') return "選擇今晚的吞噬目標\n(不可選擇狼人，不可連續兩晚吞噬同一人)";
        if (step === 'midnight') return "其餘狼人皆已出局\n請選擇今晚的襲擊目標 (或跳過以空刀)";
        
        const p = ctx.getPlayer(mySeat);
        const plugin = RoleRegistry.plugins[p.data.devouredRole];
        if (plugin?.exportedSkills?.maid) {
            return plugin.exportedSkills.maid.getPrompt(ctx, mySeat);
        }
        return "等待中...";
    },
    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        
        if (step === 'first_half') {
            return ctx.getAlivePlayers().filter(target => {
                if (target.seatNumber === mySeat) return false;
                if (target.seatNumber === p.data.lastDevouredSeat) return false;
                const isWolf = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[target.role]?.faction === 'wolf';
                if (isWolf) return false;
                return true;
            }).map(target => target.seatNumber);
        }
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        
        if (step === 'second_half') {
            const plugin = RoleRegistry.plugins[p.data.devouredRole];
            if (plugin?.exportedSkills?.maid) {
                return plugin.exportedSkills.maid.getSelectableSeats(ctx, mySeat);
            }
        }
        return [];
    },
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'first_half') return [{ id: 'devour', text: '吞噬', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
        if (step === 'midnight') return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        
        const p = ctx.getPlayer(mySeat);
        const plugin = RoleRegistry.plugins[p.data.devouredRole];
        if (plugin?.exportedSkills?.maid) {
            return plugin.exportedSkills.maid.getButtons(ctx, mySeat);
        }
        return [];
    },
    getPreSelectedTarget: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        if (p && p.data.devouredRole) {
            const plugin = RoleRegistry.plugins[p.data.devouredRole];
            if (plugin?.exportedSkills?.maid?.getPreSelectedTarget) {
                return plugin.exportedSkills.maid.getPreSelectedTarget(ctx, mySeat);
            }
        }
        return null;
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【無效行動】";
        const p = act.player;
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;

        if (step === 'first_half') {
            if (act.actionId === 'pass') return "【跳過行動】";
            const target = act.targets[0];
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : target;
            const tPlayer = ctx.getPlayer(actualTarget);
            
            p.data.devouredThisNight = true;
            p.data.devouredRole = tPlayer.data.camouflageRole || tPlayer.role;
            p.data.lastDevouredSeat = parseInt(target);
            
            p.data.virtualRoles = [p.data.devouredRole]; 
            p.data.customTopTags = p.data.customTopTags || {};
            p.data.customTopTags[actualTarget] = p.data.devouredRole; 
            
            ctx.devouredSeat = actualTarget; 
            ctx.devourerSeat = p.seatNumber; 
            
            return `【吞噬: ${target}號 (${p.data.devouredRole})】`;
        }
        
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);

        if (step === 'second_half') {
            if (act.actionId === 'pass') return "【跳過行動】";
            const plugin = RoleRegistry.plugins[p.data.devouredRole];
            if (plugin?.exportedSkills?.maid) {
                return plugin.exportedSkills.maid.resolve(ctx, act);
            }
        }
        return "【無效行動】";
    },
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.data.devouredRole === '咒狐') {
            const immuneCauses = ['killed', 'poisoned', 'doubledreamed', 'bloodlusted', 'skill_backfire', 'claw_killed', 'reflected'];
            if (immuneCauses.includes(deathMap[player.seatNumber])) {
                delete deathMap[player.seatNumber];
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】蝕日侍女(吞噬咒狐) ${player.seatNumber} 號免疫了夜間的致命傷害`);
                }
            }
        }
    },
    onPlayerDied: (ctx, player, reason) => {
        if (player.data.devouredRole === '咒狐') {
            const nightDeathReasons = ['silenthunted'];
            let isNightDeath = nightDeathReasons.includes(reason);
            if (reason === 'shot' && ctx.phase === 'AWAKENED_HUNTER_ACTION' && ctx.pendingAwakenedHunterNightDeath) {
                isNightDeath = true;
            }
            if (isNightDeath) {
                player.isDead = false;
                player.deathReason = null;
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】蝕日侍女(吞噬咒狐) ${player.seatNumber} 號免疫了夜間的直接致命傷害 (${reason})`);
                }
                return true; 
            }
        }
        return false;
    }
});
canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    getPrompt: () => "選擇今晚保佑的目標\n(不可保佑自己，不可連續兩晚保佑同一人)",
    getSelectableSeats: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.getAlivePlayers().filter(x => x.seatNumber !== mySeat && x.seatNumber !== p.data.lastBlessedSeat).map(x => x.seatNumber);
    },
    getButtons: () => [{ id: 'bless', text: '保佑', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
    resolveNightAction: (ctx, actions) => {
        const act = actions.find(a => a.player.role === '流光伯爵');
        if (!act || act.actionId === 'pass') {
            if (act) act.player.data.lastBlessedSeat = null;
            return "【跳過行動】";
        }
        
        const target = act.targets[0];
        const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'bless', act.player.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
        ctx.blessedSeat = actualTarget;
        act.player.data.lastBlessedSeat = parseInt(target);
        return `【保佑: ${target}號】`;
    },
    exportedSkills: {
        maid: {
            actionType: "single_select",
            getPrompt: () => "【吞噬技能: 流光伯爵】選擇保佑目標 (不可保佑自己，不可連續兩晚保佑同一人)",
            getSelectableSeats: (ctx, mySeat) => {
                const p = ctx.getPlayer(mySeat);
                return ctx.getAlivePlayers().filter(x => x.seatNumber !== mySeat && x.seatNumber !== p.data.maidLastBlessedSeat).map(x => x.seatNumber);
            },
            getButtons: () => [{ id: 'bless', text: '保佑', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                ctx.blessedSeat = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'bless', p.seatNumber) : (ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target));
                p.data.maidLastBlessedSeat = parseInt(target);
                return `【保佑: ${target}號】`;
            }
        },
        buff: {
            actionType: "single_select",
            getPrompt: () => "【被動：增幅】\n你獲得了額外的保佑機會(仍不可保佑自己)",
            getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
            getButtons: () => [{ id: 'bless', text: '額外保佑', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }],
            resolve: (ctx, act) => {
                const target = act.targets[0];
                const p = act.player;
                const actualTarget = ctx.getSkillTarget ? ctx.getSkillTarget(target, 'bless', p.seatNumber) : parseInt(target);
                ctx.nightTags = ctx.nightTags || {};
                ctx.nightTags.buffBlessedSeat = actualTarget;
                return `【額外保佑: ${target}號】`;
            }
        }
    }
});
RoleRegistry.register("煉金魔女", {
    canSelfExplode: false,
    nightPhase: "first_half",
    actionType: "triple_select",
    hasAction: (ctx, mySeat) => {
        return !ctx.getPlayer(mySeat).data.mistUsed;
    },
    onDeathAnnounceIntercept: (ctx, player, deathMap) => {
        // [修改] 無條件攔截。只要版型有煉金魔女，絕對沒收清晨死訊，強制延遲至下午 (完美防場外)
        return { 
            prevented: true, 
            initiator: player.seatNumber, 
            logMessage: "【系統宣告】法老之蛇存在於場上，昨夜死訊將延後至投票前公布。" 
        };
    },
    getInterruptUI: (ctx, viewer, actionPanel) => {
        actionPanel.show = true;
        actionPanel.deadline = ctx.deadline; 
        
        if (viewer.role === '煉金魔女') {
            const isRestricted = ctx.fearedSeat === viewer.seatNumber ||
                                 ctx.devouredSeat === viewer.seatNumber ||
                                 (ctx.bloodMoonSilenceNight === ctx.nightCount);

            if (viewer.isDead || viewer.data.snakeUsed || isRestricted) {
                let reasonText = "等待系統結算中...";
                if (viewer.isDead) reasonText = "你已出局，等待系統結算中...";
                else if (viewer.data.snakeUsed) reasonText = "法老之蛇已使用，等待系統結算中...";
                else if (isRestricted) reasonText = "你遭受控制，無法發動技能，等待系統結算中...";

                actionPanel.prompt = reasonText;
                actionPanel.buttons = [];
                return actionPanel; 
            }
            const victim = ctx.nightTags?.killed?.length > 0 ? ctx.nightTags.killed[0] : "無";
            let canSave = victim !== "無";
            
            if (canSave && victim === viewer.seatNumber) {
                if (ctx.rules.witchSave === 'never') canSave = false;
                if (ctx.rules.witchSave === 'first_night' && ctx.nightCount > 1) canSave = false;
            }
            if (victim !== "無") {
                actionPanel.forceTargets = true;
                actionPanel.submittedTargets = [parseInt(victim)];
            }

            if (ctx.currentStepActions.some(act => act.player.seatNumber === viewer.seatNumber)) {
                actionPanel.prompt = "行動已送出。";
                actionPanel.buttons = [];
                actionPanel.deadline = null;
            } else {
                actionPanel.prompt = `昨晚被襲擊的是 ${victim} 號。\n請選擇是否使用法老之蛇：`;
                actionPanel.buttons = [];
                if (canSave) actionPanel.buttons.push({ id: 'save', text: '使用蛇', requiresTarget: false });
                actionPanel.buttons.push({ id: 'pass', text: '不使用', requiresTarget: false });
            }
        } else {
            actionPanel.prompt = "等待玩家發動技能";
            actionPanel.buttons = [];
        }
        return actionPanel;
    },
    resolveInterruptAction: (ctx, actions) => {
        const act = actions[0];
        if (act && act.actionId === 'save') {
            const victim = ctx.nightTags?.killed?.[0];
            if (victim) {
                ctx.nightTags.savedBySnake = [victim];
                act.player.data.snakeUsed = true;
                act.player.data.customSideTags = act.player.data.customSideTags || {};
                act.player.data.customSideTags[victim] = "銀水";
                ctx.systemLog = `煉金魔女使用了蛇。`;
            }
        } else {
            ctx.systemLog = `煉金魔女未使用蛇。`;
        }
        Engine.EventBus.emit('MASTER_LOG', ctx.systemLog);
        const calculation = {
            killed: [...(ctx.nightTags.killed || [])],
            poisoned: [...(ctx.nightTags.poisoned || [])],
            saved: ctx.witchState?.savedSeat ? [ctx.witchState.savedSeat] : [],
            guarded: ctx.guardedSeat ? [ctx.guardedSeat] : [],
            dreamed: ctx.dreamedSeat ? [ctx.dreamedSeat] : [],
            lastDreamed: ctx.lastDreamedSeat ? [ctx.lastDreamedSeat] : []
        };
        if (ctx.nightTags.savedBySnake) {
            calculation.saved.push(...ctx.nightTags.savedBySnake);
        }
        ctx.pendingDawnDeaths = ctx.applyFilter('DAWN_DEATH_EVALUATION', calculation);
    },
    getPrompt: () => "選擇拘束的三名玩家\n(使狼人今晚只能從中選刀，且不可空刀)",
    getSelectableSeats: (ctx) => ctx.getAlivePlayers().map(p => p.seatNumber),
    getButtons: () => [
        { id: 'mist', text: '未明之霧', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【保留技能】";

        const targets = act.targets.map(t => parseInt(t));
        act.player.data.mistUsed = true;
        ctx.nightTags = ctx.nightTags || {};
        ctx.nightTags.restrictedWolfTargets = targets.map(t => ctx.getActualTarget ? ctx.getActualTarget(t) : t);

        return `【發動霧：拘束 ${targets.join('、')} 號】`;
    }
});

const ScholarMechanics = {
    handleAction: function(ctx, act, isScholar) {
        if (!act || act.actionId === 'pass') return "【保留技能】";
        const target = act.targets[0];
        const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        const tPlayer = ctx.getPlayer(actualTarget);
        
        ctx.nightTags = ctx.nightTags || {};
        ctx.nightTags.scholarOps = ctx.nightTags.scholarOps || { individuals: {}, wolfFactionCount: 0, wolfTargets: [] };
        
        const checkRole = tPlayer.data.camouflageRole || tPlayer.role;
        const isWolf = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[checkRole]?.faction === 'wolf';

        let isOverloaded = false;
        let isWolfOverloaded = false;

        if (act.actionId === 'buff') act.player.data.hasBuffed = true;
        if (act.actionId === 'debuff') act.player.data.hasDebuffed = true;

        if (isWolf) {
            ctx.nightTags.scholarOps.wolfFactionCount++;
            if (!ctx.nightTags.scholarOps.wolfTargets.includes(actualTarget)) {
                ctx.nightTags.scholarOps.wolfTargets.push(actualTarget);
            }
            if (ctx.nightTags.scholarOps.wolfFactionCount >= 2) {
                isWolfOverloaded = true;
            }
        } else {
            ctx.nightTags.scholarOps.individuals[actualTarget] = (ctx.nightTags.scholarOps.individuals[actualTarget] || 0) + 1;
            if (ctx.nightTags.scholarOps.individuals[actualTarget] >= 2) {
                isOverloaded = true;
            }
        }

        // 2. 處理【非狼人】陣營個人過載 (導致目標死亡)
        if (isOverloaded && !isWolf) {
            ctx.nightTags.clashDeaths = ctx.nightTags.clashDeaths || [];
            if (!ctx.nightTags.clashDeaths.includes(actualTarget)) {
                ctx.nightTags.clashDeaths.push(actualTarget);
            }
            
            const buffPhase = ctx.nightSequence.find(seq => seq.phaseId === 'scholar_action');
            if (buffPhase && buffPhase.roles[0]) {
                buffPhase.roles[0].activePlayers = buffPhase.roles[0].activePlayers.filter(p => p.seatNumber !== actualTarget);
            }
            if (ctx.nightTags.scholarDebuffTarget === actualTarget) {
                ctx.nightTags.scholarDebuffTarget = null;
            }
            
            return act.actionId === 'buff' ? `【增幅: ${target}號 (力量衝突)】` : `【削弱: ${target}號 (力量衝突)】`;
        }

        // 3. 處理【狼人陣營】群體過載反噬 (導致導師死亡，狼隊狀態重置)
        if (isWolfOverloaded && isWolf) {
            ctx.nightTags.clashDeaths = ctx.nightTags.clashDeaths || [];
            const mentor = ctx.players.find(p => p.role === '寂夜導師' && !p.isDead);
            
            if (mentor && !ctx.nightTags.clashDeaths.includes(mentor.seatNumber)) {
                ctx.nightTags.clashDeaths.push(mentor.seatNumber);
            }
            
            const buffPhase = ctx.nightSequence.find(seq => seq.phaseId === 'scholar_action');
            if (buffPhase && buffPhase.roles[0]) {
                buffPhase.roles[0].activePlayers = buffPhase.roles[0].activePlayers.filter(p => {
                    const pRole = p.data.camouflageRole || p.role;
                    return typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[pRole]?.faction !== 'wolf';
                });
            }
            
            ctx.nightTags.wolfTeamScholarDebuffed = false;
            if (ctx.nightTags.scholarDebuffTarget) {
                const debuffedP = ctx.getPlayer(ctx.nightTags.scholarDebuffTarget);
                if (debuffedP) {
                    const cRole = debuffedP.data.camouflageRole || debuffedP.role;
                    if (typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[cRole]?.faction === 'wolf') {
                        ctx.nightTags.scholarDebuffTarget = null;
                    }
                }
            }

            return act.actionId === 'buff' ? `【增幅: ${target}號 (陣營過載)】` : `【削弱: ${target}號 (陣營過載)】`;
        }

        // 4. 正常單一作用生效
        if (act.actionId === 'buff') {
            tPlayer.data.virtualRoles = tPlayer.data.virtualRoles || [];
            if (!tPlayer.data.virtualRoles.includes('受增幅者')) tPlayer.data.virtualRoles.push('受增幅者');
            
            let buffPhase = ctx.nightSequence.find(seq => seq.phaseId === 'scholar_action');
            if (!buffPhase) {
                ctx.nightSequence.push({
                    phaseId: 'scholar_action', phaseName: '增幅行動',
                    roles: [{ roleName: '受增幅者', roleDef: RoleRegistry.plugins['受增幅者'], activePlayers: [tPlayer], resultLog: "" }]
                });
            } else {
                if (!buffPhase.roles[0].activePlayers.some(ap => ap.seatNumber === actualTarget)) {
                    buffPhase.roles[0].activePlayers.push(tPlayer);
                }
            }
            // [淨化] 刪除寫入 seerRecords 的邏輯
            return `【增幅: ${target}號】`;
        } else {
            ctx.nightTags.scholarDebuffTarget = actualTarget;
            if (isWolf) {
                ctx.nightTags.wolfTeamScholarDebuffed = true;
            }
            // [淨化] 刪除寫入 seerRecords 的邏輯
            return `【削弱: ${target}號】`;
        }
    }
};

RoleRegistry.register("白晝學者", {
    canSelfExplode: false,
    nightPhase: "first_half",
    actionType: "single_select",
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount >= 2 && (!p.data.hasBuffed || !p.data.hasDebuffed);
    },
    getPrompt: () => "選擇發動增幅或削弱",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        let btns = [];
        if (!p.data.hasBuffed) btns.push({ id: 'buff', text: '增幅', requiresTarget: true });
        if (!p.data.hasDebuffed) btns.push({ id: 'debuff', text: '削弱', requiresTarget: true });
        btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
        return btns;
    },
    resolveNightAction: (ctx, actions) => ScholarMechanics.handleAction(ctx, actions[0], true)
});

RoleRegistry.register("寂夜導師", {
    canSelfExplode: true,
    canSeeWolves: false,
    seenAsWolf: true,
    isAttacker: false,
    hasWolfChatAccess: false,
    nightPhase: "first_half",
    actionType: "single_select",
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount >= 2 && (!p.data.hasBuffed || !p.data.hasDebuffed);
    },
    getPrompt: () => "選擇發動增幅或削弱",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        let btns = [];
        if (!p.data.hasBuffed) btns.push({ id: 'buff', text: '增幅', requiresTarget: true });
        if (!p.data.hasDebuffed) btns.push({ id: 'debuff', text: '削弱', requiresTarget: true });
        btns.push({ id: 'pass', text: '跳過', requiresTarget: false });
        return btns;
    },
    resolveNightAction: (ctx, actions) => ScholarMechanics.handleAction(ctx, actions[0], false)
});

RoleRegistry.register("受增幅者", {
    actionType: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        const basePlugin = RoleRegistry.plugins[p.role];
        const buffSkill = basePlugin?.exportedSkills?.buff || (ROLE_DICTIONARY[p.role]?.faction === 'wolf' ? RoleRegistry.plugins["狼人"].exportedSkills.buff : null);
        if (buffSkill) {
            const type = buffSkill.actionType;
            return typeof type === 'function' ? type(ctx, mySeat) : type;
        }
        return "single_select";
    },
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        const basePlugin = RoleRegistry.plugins[p.role];
        return !!(basePlugin?.exportedSkills?.buff || ROLE_DICTIONARY[p.role]?.faction === 'wolf');
    },
    getPrompt: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        const basePlugin = RoleRegistry.plugins[p.role];
        const buffSkill = basePlugin?.exportedSkills?.buff || (ROLE_DICTIONARY[p.role]?.faction === 'wolf' ? RoleRegistry.plugins["狼人"].exportedSkills.buff : null);
        if (buffSkill) return buffSkill.getPrompt(ctx, mySeat);
        return "你獲得了增幅，但無法使用";
    },
    getSelectableSeats: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        const basePlugin = RoleRegistry.plugins[p.role];
        const buffSkill = basePlugin?.exportedSkills?.buff || (ROLE_DICTIONARY[p.role]?.faction === 'wolf' ? RoleRegistry.plugins["狼人"].exportedSkills.buff : null);
        if (buffSkill) return buffSkill.getSelectableSeats(ctx, mySeat);
        return [];
    },
    getButtons: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        const basePlugin = RoleRegistry.plugins[p.role];
        const buffSkill = basePlugin?.exportedSkills?.buff || (ROLE_DICTIONARY[p.role]?.faction === 'wolf' ? RoleRegistry.plugins["狼人"].exportedSkills.buff : null);
        if (buffSkill) return buffSkill.getButtons(ctx, mySeat);
        return [{ id: 'pass', text: '確認', requiresTarget: false }];
    },
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) return "【跳過行動】";
        
        const p = act.player;
        const basePlugin = RoleRegistry.plugins[p.role];
        const buffSkill = basePlugin?.exportedSkills?.buff || (ROLE_DICTIONARY[p.role]?.faction === 'wolf' ? RoleRegistry.plugins["狼人"].exportedSkills.buff : null);
        
        if (buffSkill) {
            return buffSkill.resolve(ctx, act);
        }
        return "【無效行動】";
    }
});
RoleRegistry.register("野孩子", {
    getFaction: (ctx, player) => player.data.isEnraged ? 'wolf' : 'good',
    getType: (ctx, player) => player.data.isEnraged ? 'wolf' : 'villager',
    canSelfExplode: (ctx, player) => !!player.data.isEnraged,
    canSeeWolves: (ctx, player) => !!player.data.isEnraged,
    hasWolfChatAccess: (ctx, player) => !!player.data.isEnraged,
    seenBySeerAsWolf: (ctx, seat) => !!ctx.getPlayer(seat).data.isEnraged,
    isAttacker: (ctx, seat) => {
        const p = typeof seat === 'object' ? seat : ctx.getPlayer(seat);
        return !!p.data.isEnraged && ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight';
    },

    nightPhase: ["first_half", "midnight"],
    nightPriority: 4, 
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half' ? 'single_select' : 'consensus',
    
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        if (step === 'first_half') return ctx.nightCount === 1 && !p.data.wildModelTarget;
        if (step === 'midnight') return !!p.data.isEnraged;
        return false;
    },

    getPrompt: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "你已狂暴，請與狼同伴選擇襲擊目標";
        return "選擇你的榜樣\n榜樣出局後你將狂暴成為狼人";
    },
    
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence[ctx.currentNightStepIndex].phaseId === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
    },
    
    getButtons: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        return [{ id: 'choose_model', text: '選擇榜樣', requiresTarget: true }];
    },

    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act) return "【無效行動】";
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);

        if (step === 'first_half') {
            if (act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
                const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== act.player.seatNumber).map(p => p.seatNumber);
                const target = selectable[Math.floor(Math.random() * selectable.length)];
                const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target); // [新增]
                act.player.data.wildModelTarget = actualTarget;
                return `【強制選擇榜樣: ${target}號】`;
            }
            const target = act.targets[0];
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target); // [新增]
            act.player.data.wildModelTarget = actualTarget;
            return `【選擇榜樣: ${target}號】`;
        }
    },

    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (observer.data.wildModelTarget === deadPlayer.seatNumber && !observer.data.isEnraged) {
            observer.data.isEnraged = true;
            
            observer.data.customTopTags = observer.data.customTopTags || {};
            ctx.players.forEach(p => {
                if (p.seatNumber !== observer.seatNumber && ctx.getDynamicFaction(p) === 'wolf') {
                    observer.data.customTopTags[p.seatNumber] = p.role;
                }
            });
            
            ctx.players.forEach(p => {
                if (p.seatNumber !== observer.seatNumber && ctx.getDynamicFaction(p) === 'wolf' && RoleRegistry.plugins[p.role]?.canSeeWolves) {
                    p.data.customTopTags = p.data.customTopTags || {};
                    p.data.customTopTags[observer.seatNumber] = observer.role;
                }
            });

            ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：野孩子 ${observer.seatNumber} 號的榜樣出局，已狂暴成為狼人)`;
        }
    }
});
RoleRegistry.register("復仇者", {
    nightPhase: "first_half", 
    actionType: "single_select",
    nightPriority: 4,
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount === 1 && !p.data.avengerTarget;
    },
    getPrompt: () => "請選擇你的仇恨對象\n你的勝利條件將與他相反",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'choose_hate', text: '選擇仇恨', requiresTarget: true }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || !act.targets || act.targets.length === 0) {
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== act.player.seatNumber).map(p => p.seatNumber);
            const target = selectable[Math.floor(Math.random() * selectable.length)];
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target); // [新增]
            act.player.data.avengerTarget = actualTarget;
            return `【強制選擇仇恨: ${target}號】`;
        }
        const target = act.targets[0];
        const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target); // [新增]
        act.player.data.avengerTarget = actualTarget;
        return `【選擇仇恨: ${target}號】`;
    }
});
RoleRegistry.register("邱比特", {
    nightPhase: "first_half",
    actionType: "double_select",
    nightPriority: 4,
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount === 1 && !p.data.hasShotArrow;
    },
    getPrompt: () => "請選擇兩名玩家成為情侶\n(若為一好一狼將組成第三方陣營)",
    getSelectableSeats: (ctx, mySeat) => ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber),
    getButtons: () => [{ id: 'shoot_arrow', text: '指定情侶', requiresTarget: true }],
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || !act.targets || act.targets.length < 2) {
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== act.player.seatNumber).map(p => p.seatNumber);
            act.targets = [selectable[0], selectable[1]];
        }
        const t1 = act.targets[0];
        const t2 = act.targets[1];
        const actualT1 = ctx.getActualTarget ? ctx.getActualTarget(t1) : parseInt(t1); // [新增]
        const actualT2 = ctx.getActualTarget ? ctx.getActualTarget(t2) : parseInt(t2); // [新增]
        
        ctx.lovers = [actualT1, actualT2];
        act.player.data.hasShotArrow = true;
        return `【指定情侶: ${t1}號 與 ${t2}號】`;
    },

    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (ctx.lovers && ctx.lovers.includes(deadPlayer.seatNumber)) {
            const otherLoverSeat = ctx.lovers.find(s => s !== deadPlayer.seatNumber);
            const otherLover = ctx.getPlayer(otherLoverSeat);
            if (otherLover && !otherLover.isDead) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：情侶 ${deadPlayer.seatNumber} 號出局，${otherLoverSeat} 號隨之殉情)`;
                otherLover.kill('martyr', ctx);
            }
        }
    },

    checkWinCondition: (ctx, player) => {
        if (!ctx.lovers || ctx.lovers.length < 2) return null;
        const l1 = ctx.getPlayer(ctx.lovers[0]);
        const l2 = ctx.getPlayer(ctx.lovers[1]);
        if (!l1 || !l2) return null;
        const f1 = ctx.getDynamicFaction(l1);
        const f2 = ctx.getDynamicFaction(l2);
        if (f1 === f2) return null;
        if (l1.isDead && l2.isDead) return null;
        const alive = ctx.getAlivePlayers();
        const otherAlive = alive.filter(p => p.seatNumber !== l1.seatNumber && p.seatNumber !== l2.seatNumber && p.seatNumber !== player.seatNumber);

        if (otherAlive.length === 0) {
            return { winner: "第三方陣營 (人狼戀)", reason: "情侶與邱比特成功淘汰全場其他玩家" };
        } else {
            return { preventNormalWin: true };
        }
    }
});
RoleRegistry.register("盜賊", {
    nightPhase: "thief_action",
    actionType: "thief_pick", // [修改] 宣告專屬的圖片選擇 UI 類型
    nightPriority: -1,
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        return ctx.nightCount === 1 && !p.data.hasStolen;
    },
    getPrompt: () => "選擇你本局的身分", // [修改] 精簡文字，拔除冗餘說明
    getSelectableSeats: () => [],
    getButtons: (ctx) => {
        let btns = [];
        const cards = ctx.extraCards || [];
        const hasWolf = cards.some(c => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[c]?.faction === 'wolf');
        
        cards.forEach((card, idx) => {
            const isWolf = typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[card]?.faction === 'wolf';
            const isLocked = hasWolf && !isWolf; // 若有狼且這張不是狼，則鎖死
            
            btns.push({ 
                id: isLocked ? `locked_${idx}` : `pick_${idx}`, // 防呆：鎖死的按鈕給予無效 ID
                text: card, 
                cardName: card,      // [擴充] 供 ui.js 讀取對應的圖片
                isLocked: isLocked,  // [擴充] 供 ui.js 判斷是否套用灰階與禁用點擊
                requiresTarget: false 
            });
        });
        
        return btns;
    },
    resolveNightAction: (ctx, actions) => {
        let act = actions[0];

        if (!act || !act.actionId.startsWith('pick_')) {
            const cards = ctx.extraCards || [];
            const hasWolf = cards.some(c => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[c]?.faction === 'wolf');
            const p = ctx.players.find(x => x.role === '盜賊' && !x.isDead);
            if (p) {
                let forcedCard = cards[0];
                if (hasWolf) {
                    forcedCard = cards.find(c => typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[c]?.faction === 'wolf');
                }
                act = { player: p, actionId: `pick_${cards.indexOf(forcedCard)}` };
            } else return "【無效行動】";
        }
        
        const p = act.player;
        p.data.hasStolen = true;

        const pickIdx = parseInt(act.actionId.replace('pick_', ''));
        const newRole = ctx.extraCards[pickIdx];
    
        p.role = newRole;
        p.data.camouflageRole = newRole;
        p.data.customTopTags = p.data.customTopTags || {};
        p.data.customTopTags[p.seatNumber] = newRole;
        
        const newDef = RoleRegistry.plugins[newRole];
        if (newDef && newDef.nightPhase) {
            const phaseArray = Array.isArray(newDef.nightPhase) ? newDef.nightPhase : [newDef.nightPhase];
            const orderMap = { 'thief_action': 0, 'first_half': 1, 'lucky_action': 2, 'scholar_action': 3, 'midnight': 4, 'second_half': 5 };
            const getPhaseDisplayName = (pid) => ({ 'first_half': '前半夜', 'midnight': '午夜 (狼人)', 'second_half': '後半夜', 'lucky_action': '幸運兒行動', 'scholar_action': '增幅行動' }[pid] || pid);

            phaseArray.forEach(phaseName => {
                let targetSeq = ctx.nightSequence.find(s => s.phaseId === phaseName);
                if (!targetSeq) {
                    targetSeq = { phaseId: phaseName, phaseName: getPhaseDisplayName(phaseName), roles: [] };
                    ctx.nightSequence.push(targetSeq);
                    ctx.nightSequence.sort((a, b) => (orderMap[a.phaseId]||99) - (orderMap[b.phaseId]||99));
                }
                
                let rObj = targetSeq.roles.find(r => r.roleName === newRole);
                if (!rObj) {
                    targetSeq.roles.push({ roleName: newRole, roleDef: newDef, activePlayers: [p], resultLog: "" });
                    targetSeq.roles.sort((a, b) => (RoleRegistry.plugins[a.roleName]?.nightPriority || 99) - (RoleRegistry.plugins[b.roleName]?.nightPriority || 99));
                } else {
                    if (!rObj.activePlayers.some(ap => ap.seatNumber === p.seatNumber)) {
                        rObj.activePlayers.push(p);
                    }
                }
            });
        }

        if (newDef && typeof newDef.onNightStart === 'function') {
            newDef.onNightStart(ctx, p);
        }

        return `【替換身分: ${newRole}】`;
    }
});
RoleRegistry.register("夜之貴族", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    immuneToWolfBite: true, 
    hasWolfChatAccess: true,
    nightPhase: ["first_half", "midnight"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    
    onNightStart: (ctx, player) => {
        if (ctx.nightServantExpireNight && ctx.nightCount > ctx.nightServantExpireNight) {
            if (player.data.customSideTags && player.data.customSideTags[ctx.nightServantSeat] === "夜僕") {
                delete player.data.customSideTags[ctx.nightServantSeat];
            }
            ctx.nightServantSeat = null;
            ctx.nightServantExpireNight = null;
        }
    },
    
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return true;
        if (step === 'first_half') return ctx.nightCount >= 2 && !ctx.nightServantSeat;
        return false;
    },
    
    getPrompt: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') {
            if (ctx.nightCount === 1 && ctx.rules.firstNightKill === 'disabled') return "【規則：首夜無刀】\n今晚無法發起襲擊，可使用語音或右下角通訊頻道交流。";
            return "選擇今晚的襲擊目標";
        }
        return "選擇一名玩家成為夜僕\n(該玩家將在下個夜晚結束後死亡)";
    },
    
    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber);
    },
    
    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getButtons(ctx, mySeat);
        return [{ id: 'bloodlust', text: '指定夜僕', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
    },
    
    resolveNightAction: (ctx, actions) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        const target = act.targets[0];
        const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        ctx.nightServantSeat = actualTarget;
        ctx.nightServantExpireNight = ctx.nightCount + 1;
        
        act.player.data.customSideTags = act.player.data.customSideTags || {};
        act.player.data.customSideTags[actualTarget] = "夜僕";
        
        return `【指定夜僕: ${target}號】`;
    },
    
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightServantSeat && ctx.nightCount === ctx.nightServantExpireNight) {
            const servant = ctx.getPlayer(ctx.nightServantSeat);
            if (servant && !servant.isDead) {
                deathMap[servant.seatNumber] = 'bloodlusted';
                if (!ctx.nightTags) ctx.nightTags = {};
                if (!ctx.nightTags.servantLogWritten) {
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】夜僕 ${servant.seatNumber} 號死亡倒數結束，因嗜血出局`);
                    }
                    ctx.nightTags.servantLogWritten = true;
                }
            }
        }
    },
    
    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (ctx.nightServantSeat === deadPlayer.seatNumber) {
            ctx.nightServantSeat = null;
            ctx.nightServantExpireNight = null;
            
            if (observer.data.customSideTags && observer.data.customSideTags[deadPlayer.seatNumber] === "夜僕") {
                delete observer.data.customSideTags[deadPlayer.seatNumber];
            }
        }
    }
});
RoleRegistry.register("覺醒愚者", {
    canSelfExplode: false,
    nightPhase: "second_half",
    actionType: "single_select",
    
    onNightStart: (ctx, player) => {
        // 首夜初始化技能狀態
        if (ctx.nightCount === 1) {
            player.data.hasSecretBody = true;
            player.data.hasFlippedAsFool = false;
        }
    },
    
    hasAction: (ctx, mySeat) => {
        const p = ctx.getPlayer(mySeat);
        // 僅在擁有秘密之身時允許發動夜間技能
        return !!p.data.hasSecretBody;
    },
    
    getPrompt: () => "選擇以「秘密之身」守護的目標\n(若目標未受傷害，守護將自動轉移至自己)",
    
    getSelectableSeats: (ctx) => {
        // 可守護包含自己在內的任何存活玩家
        return ctx.getAlivePlayers().map(p => p.seatNumber);
    },
    
    getButtons: () => [
        { id: 'guard', text: '守護', requiresTarget: true },
        { id: 'pass', text: '跳過', requiresTarget: false }
    ],
    
    resolveNightAction: (ctx, actions) => {
        const act = actions[0];
        if (!act || act.actionId === 'pass') {
            ctx.foolGuardedSeat = null;
            return "【跳過行動】";
        }
        
        const target = act.targets[0];
        // 寫入當晚守護目標
        ctx.foolGuardedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        return `【守護: ${target}號】`;
    },
    
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (!ctx.foolGuardedSeat || !player.data.hasSecretBody || player.isDead) return;
        
        const targetSeat = ctx.foolGuardedSeat;
        const foolSeat = player.seatNumber;
        const blockableCauses = ['killed', 'poisoned', 'doubledreamed', 'bloodlusted', 'skill_backfire'];
        let blocked = false;
        if (blockableCauses.includes(deathMap[targetSeat])) {
            delete deathMap[targetSeat];
            blocked = true;
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】覺醒愚者的秘密之身生效，為 ${targetSeat} 號擋下了致命傷害`);
            }
        } else {
            if (blockableCauses.includes(deathMap[foolSeat])) {
                delete deathMap[foolSeat];
                blocked = true;
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】覺醒愚者的秘密之身轉移並生效，為自己擋下了致命傷害`);
                }
            }
        }
        if (blocked) {
            player.data.hasSecretBody = false;
        }
        ctx.foolGuardedSeat = null;
    },
    
    onVotedOut: (ctx, player) => {
        if (player.data.hasSecretBody) {
            player.isRevealed = true;
            player.data.hasFlippedAsFool = true;
            player.data.hasSecretBody = false; 
            
            return {
                prevented: true,
                transferSheriff: false,
                logMessage: `投票結果出爐，${player.seatNumber} 號玩家為覺醒愚者！\n翻牌自證免除放逐並失去秘密之身，但仍保留發言與投票權。`
            };
        }
        return { prevented: false };
    }
});
RoleRegistry.register("覺醒獵人", {
    canSelfExplode: false,
    onPlayerDied: (ctx, player, reason) => {
        if (reason !== 'martyr') {
            if (reason !== 'voted') {
                const isFeared = ctx.fearedSeat === player.seatNumber;
                const isDevoured = ctx.devouredSeat === player.seatNumber;
                const isDebuffed = ctx.nightTags?.scholarDebuffTarget === player.seatNumber;
                if (isFeared || isDevoured || isDebuffed) {
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】覺醒獵人 ${player.seatNumber} 號死亡，因恐懼/吞噬/削弱無法發動巡獵。`);
                    }
                    return; 
                }
            }
            ctx.pendingAwakenedHunter = player.seatNumber;
            const dayReasons = ['voted', 'shot', 'dueled', 'skill_expired'];
            let isNightDeath = !dayReasons.includes(reason);
            if (reason === 'charmed') {
                const dayActionPhases = ['DAY_VOTING', 'DAY_PK_VOTING', 'DAY_DISCUSSION', 'DAY_PK_SPEECH', 'SHERIFF_SPEECH', 'SHERIFF_PK_SPEECH', 'PRINCE_SPEECH', 'POST_VOTE_SKILL', 'HUNTER_ACTION', 'WOLFKING_ACTION', 'BLOODMOON_ACTION'];
                if (dayActionPhases.includes(ctx.phase)) {
                    isNightDeath = false;
                }
            }
            ctx.pendingAwakenedHunterNightDeath = isNightDeath;
        }
    }
});
RoleRegistry.register("覺醒狼美人", {
    canSelfExplode: false, 
    canSeeWolves: true,
    seenAsWolf: true,
    immuneToWolfBite: true,
    hasWolfChatAccess: true,
    nightPhase: ["midnight", "second_half"], 
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    
    onNightStart: (ctx, player) => {
        if (player.data.dirgedThisNight) {
            player.data.hasDirgedLastNight = true;
            player.data.dirgedThisNight = false;
        } else {
            player.data.hasDirgedLastNight = false;
        }
    },
    
    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        if (step === 'midnight') return true;
        if (step === 'second_half') return !p.data.hasDirgedLastNight;
        return false;
    },
    
    getPrompt: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') return "選擇今晚的襲擊目標";
        return "選擇今晚的輓歌目標 (不能連續兩晚發動)";
    },
    
    getSelectableSeats: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        }
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat).map(p => p.seatNumber); 
    },
    
    getButtons: (ctx, mySeat) => {
        if (ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight') {
            return [{ id: 'confirm', text: '確認襲擊', requiresTarget: true }, { id: 'pass', text: '空刀', requiresTarget: false }];
        }
        return [{ id: 'dirge', text: '輓歌', requiresTarget: true }, { id: 'pass', text: '跳過', requiresTarget: false }];
    },
    
    resolveNightAction: (ctx, actions) => {
        const phaseId = ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId;
        if (phaseId === 'midnight') {
            return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);
        }
        
        const act = actions[0];
        if (!act || act.actionId === 'pass') return "【跳過行動】";
        
        const target = act.targets[0];
        ctx.dirgedSeat = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        
        act.player.data.dirgedThisNight = true;
        act.player.data.customSideTags = act.player.data.customSideTags || {};
        act.player.data.customSideTags[ctx.dirgedSeat] = "輓歌";
        
        return `【輓歌: ${target}號】`;
    },
    
    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (deathMap[player.seatNumber] && deathMap[player.seatNumber] !== 'silenthunted') {
            if (ctx.dirgedSeat) {
                const target = ctx.getPlayer(ctx.dirgedSeat);
                if (target && !target.isDead) {
                    delete deathMap[player.seatNumber];
                    deathMap[target.seatNumber] = 'charmed';
                    
                    if (typeof Engine !== 'undefined' && Engine.EventBus) {
                        Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】覺醒狼美人的輓歌生效，${target.seatNumber} 號代替出局`);
                    }
                }
            }
        }
    },
    
    onVotedOut: (ctx, player) => {
        if (ctx.dirgedSeat) {
            const target = ctx.getPlayer(ctx.dirgedSeat);
            if (target && !target.isDead) {
                player.isRevealed = true;
                target.kill('charmed', ctx);
                ctx.lastWordsTargets = [target.seatNumber];
                
                return {
                    prevented: true,
                    transferSheriff: false,
                    logMessage: `投票結果出爐，${player.seatNumber} 號玩家為覺醒狼美人！\n翻牌自證免除放逐，輓歌發動，${target.seatNumber} 號玩家代替出局。`
                };
            }
        }
        return { prevented: false };
    },
    
    onPlayerDied: (ctx, player, reason) => {
        if (reason === 'voted' || reason === 'silenthunted') return false; 
        
        if (ctx.dirgedSeat) {
            const target = ctx.getPlayer(ctx.dirgedSeat);
            if (target && !target.isDead) {
                player.isDead = false;
                player.deathReason = null;
                
                const dayReasons = ['shot', 'dueled'];
                if (dayReasons.includes(reason)) {
                    player.isRevealed = true;
                }
                
                target.kill('charmed', ctx);
                setTimeout(() => {
                    if (ctx.daySkillLastWordsQueue && ctx.daySkillLastWordsQueue.includes(player.seatNumber)) {
                        ctx.daySkillLastWordsQueue = [target.seatNumber];
                    }
                }, 0);
                
                if (typeof Engine !== 'undefined' && Engine.EventBus) {
                    Engine.EventBus.emit('BROADCAST_MESSAGE', `【突發事件】覺醒狼美人受到致命傷，翻牌並發動輓歌，${target.seatNumber} 號玩家代替出局。`);
                }
                return true;
            }
        }
        return false;
    },
    
    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (ctx.dirgedSeat === deadPlayer.seatNumber) {
            ctx.dirgedSeat = null;
            if (observer.data.customSideTags && observer.data.customSideTags[deadPlayer.seatNumber] === "輓歌") {
                delete observer.data.customSideTags[deadPlayer.seatNumber];
            }
        }
    }
});
RoleRegistry.register("巫妖", {
    canSelfExplode: false,
    canSeeWolves: true,
    seenAsWolf: true,
    isAttacker: true,
    hasWolfChatAccess: true,
    nightPhase: ["first_half", "midnight"],
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight' ? 'consensus' : 'single_select',

    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'first_half') return ctx.nightCount === 1 && !ctx.getPlayer(mySeat).data.hasConverted;
        if (step === 'midnight') return true;
        return false;
    },

    getPrompt: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'first_half') return "第一晚必須選擇一名相鄰於狼人的玩家成為轉化者";
        return "選擇今晚的襲擊目標";
    },

    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);

        let validTargets = new Set();
        // 抓出所有具備刀人權限的狼人
        const attackers = ctx.getAlivePlayers().filter(p => {
            const plugin = RoleRegistry.plugins[p.role];
            return ctx.getDynamicFaction(p) === 'wolf' && (typeof plugin?.isAttacker === 'function' ? plugin.isAttacker(ctx, p.seatNumber) : plugin?.isAttacker);
        });

        // 進行物理座位 +1 與 -1 的模數擴展
        attackers.forEach(attacker => {
            const left = ctx.getNextAliveSeat(attacker.seatNumber, -1);
            const right = ctx.getNextAliveSeat(attacker.seatNumber, 1);
            if (left) validTargets.add(left);
            if (right) validTargets.add(right);
        });

        // 過濾掉已經是狼人陣營的目標
        return Array.from(validTargets).filter(seat => {
            const p = ctx.getPlayer(seat);
            return p && ctx.getDynamicFaction(p) !== 'wolf';
        });
    },

    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getButtons(ctx, mySeat);
        return [{ id: 'convert', text: '轉化', requiresTarget: true }];
    },

    resolveNightAction: (ctx, actions) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);

        if (step === 'first_half') {
            let logs = [];
            const allLiches = ctx.getAlivePlayers().filter(p => p.role === '巫妖' && !p.data.hasConverted);
            
            allLiches.forEach(lich => {
                let act = actions.find(a => a.player.seatNumber === lich.seatNumber);
                let targetSeat;
                
                // 若超時或無效點擊，系統介入進行強制隨機選擇 (防呆)
                if (!act || act.actionId === 'pass' || !act.targets || act.targets.length === 0) {
                    const plugin = RoleRegistry.plugins["巫妖"];
                    const selectables = plugin.getSelectableSeats(ctx, lich.seatNumber);
                    // 二次過濾，避免多巫妖隨機選到同一人
                    const validSelectables = selectables.filter(s => {
                        const actTgt = ctx.getActualTarget ? ctx.getActualTarget(s) : s;
                        return !ctx.getPlayer(actTgt).data.isConverted;
                    });
                    if (validSelectables.length > 0) {
                        targetSeat = validSelectables[Math.floor(Math.random() * validSelectables.length)];
                    }
                } else {
                    targetSeat = parseInt(act.targets[0]);
                }
                
                if (targetSeat) {
                    lich.data.hasConverted = true;
                    const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(targetSeat) : targetSeat;
                    const tPlayer = ctx.getPlayer(actualTarget);
                    tPlayer.data.isConverted = true;
                    ctx.getAlivePlayers().forEach(p => {
                        const plugin = RoleRegistry.plugins[p.role];
                        const isAttackingWolf = ctx.getDynamicFaction(p) === 'wolf' && (typeof plugin?.isAttacker === 'function' ? plugin.isAttacker(ctx, p.seatNumber) : plugin?.isAttacker);
                        if (isAttackingWolf) {
                            p.data.customTopTags = p.data.customTopTags || {};
                            p.data.customTopTags[actualTarget] = '轉化者';
                        }
                    });
                    logs.push(`【${lich.seatNumber}號 轉化: ${targetSeat}號】`);
                } else {
                    logs.push(`【${lich.seatNumber}號 無效行動 (無合法目標)】`);
                }
            });
            return logs.join('\n');
        }
    }
});
RoleRegistry.register("咒狐", {
    faction: "third_party",
    type: "third_party",
    canSelfExplode: false,
    seenBySeerAsGood: true, 
    nightPhase: "none",
    actionType: "none",
    hijackNormalWin: (ctx, player, originalWinner) => {
        if (player.isDead) return null;
        return {
            winner: "第三方陣營 (咒狐)",
            reason: `咒狐存活至常規遊戲結束，取代${originalWinner}陣營獲得勝利`
        };
    },

    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (player.isDead) return;
        if (ctx.devouredSeat === player.seatNumber) return;
        let isPurified = false;
        ctx.players.forEach(p => {
            if (!p.isDead && p.data.latestCheckResult && p.data.latestCheckResult.purifiesFox) {
                const checkResult = p.data.latestCheckResult;
                let targets = [];
                if (checkResult.seat) targets.push(ctx.getSkillTarget ? ctx.getSkillTarget(checkResult.seat, 'check', p.seatNumber) : parseInt(checkResult.seat));
                if (checkResult.seat2) targets.push(ctx.getSkillTarget ? ctx.getSkillTarget(checkResult.seat2, 'check', p.seatNumber) : parseInt(checkResult.seat2));
                
                if (targets.includes(player.seatNumber)) {
                    isPurified = true;
                }
            }
        });
        
        const immuneCauses = ['killed', 'poisoned', 'doubledreamed', 'bloodlusted', 'skill_backfire', 'claw_killed', 'reflected'];
        if (immuneCauses.includes(deathMap[player.seatNumber])) {
            delete deathMap[player.seatNumber];
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】咒狐 ${player.seatNumber} 號免疫了夜間的致命傷害`);
            }
        }

        if (isPurified) {
            deathMap[player.seatNumber] = 'purified';
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】咒狐 ${player.seatNumber} 號遭到查驗，引發淨化出局`);
            }
        }
    },
    
    onPlayerDied: (ctx, player, reason) => {
        if (ctx.devouredSeat === player.seatNumber) return false;
        const nightDeathReasons = ['silenthunted'];
        let isNightDeath = nightDeathReasons.includes(reason);
        
        if (reason === 'shot' && ctx.phase === 'AWAKENED_HUNTER_ACTION' && ctx.pendingAwakenedHunterNightDeath) {
            isNightDeath = true;
        }
        
        if (isNightDeath) {
            player.isDead = false;
            player.deathReason = null;
            if (typeof Engine !== 'undefined' && Engine.EventBus) {
                Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】咒狐 ${player.seatNumber} 號免疫了夜間的直接致命傷害 (${reason})`);
            }
            return true;
        }
        return false;
    }
});
RoleRegistry.register("魅魔", {
    faction: "third_party",
    type: "third_party",
    canSelfExplode: false,
    canSeeWolves: true,
    seenAsWolf: false, // [修復核心] 關閉強制曝光，改由 customTopTags 進行偽裝
    seenBySeerAsWolf: true,
    hasWolfChatAccess: true,
    getFaction: () => 'wolf', // [新增] 動態陣營視為狼人，確保其襲擊票數能被狼隊系統正確計入
    nightPhase: ["first_half", "midnight"],
    nightPriority: 4,
    
    isAttacker: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'midnight',
    actionType: (ctx) => ctx.nightSequence?.[ctx.currentNightStepIndex]?.phaseId === 'first_half' ? 'single_select' : 'consensus',

    onNightStart: (ctx, player) => {
        if (ctx.nightCount === 1) {
            ctx.players.forEach(p => {
                if (p.seatNumber !== player.seatNumber && ctx.getDynamicFaction(p) === 'wolf') {
                    p.data.customTopTags = p.data.customTopTags || {};
                    p.data.customTopTags[player.seatNumber] = '狼人';
                }
            });
        }
    },

    hasAction: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        const p = ctx.getPlayer(mySeat);
        if (step === 'midnight') return true;
        if (step === 'first_half') return ctx.nightCount === 1 && !ctx.succubusLovers;
        return false;
    },

    getPrompt: (ctx) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return "選擇今晚的襲擊目標";
        return "選擇一名非狼人玩家與自己連結為情侶\n(雙方將同生共死，勝利條件變為屠城)";
    },

    getSelectableSeats: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getSelectableSeats(ctx, mySeat);
        return ctx.getAlivePlayers().filter(p => p.seatNumber !== mySeat && ctx.getDynamicFaction(p) !== 'wolf').map(p => p.seatNumber);
    },

    getButtons: (ctx, mySeat) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].getButtons(ctx, mySeat);
        return [{ id: 'charm_lover', text: '魅惑連結', requiresTarget: true }];
    },

    resolveNightAction: (ctx, actions) => {
        const step = ctx.nightSequence[ctx.currentNightStepIndex].phaseId;
        if (step === 'midnight') return RoleRegistry.plugins["狼人"].resolveNightAction(ctx, actions);

        const act = actions[0];
        if (!act || !act.targets || act.targets.length === 0) {
            const selectable = ctx.getAlivePlayers().filter(p => p.seatNumber !== act.player.seatNumber && ctx.getDynamicFaction(p) !== 'wolf').map(p => p.seatNumber);
            const target = selectable[Math.floor(Math.random() * selectable.length)];
            const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
            ctx.succubusLovers = [act.player.seatNumber, actualTarget];
            return `【強制連結: ${target}號】`;
        }
        
        const target = act.targets[0];
        const actualTarget = ctx.getActualTarget ? ctx.getActualTarget(target) : parseInt(target);
        ctx.succubusLovers = [act.player.seatNumber, actualTarget];
        return `【魅惑連結: ${target}號】`;
    },

    onPhaseChanged: (ctx, player, phase) => {
        if (phase === 'VOTE_RESULT_DISPLAY' && ctx.succubusLovers) {
            const s1 = ctx.getPlayer(ctx.succubusLovers[0]);
            const s2 = ctx.getPlayer(ctx.succubusLovers[1]);
            
            if (s1 && s2 && !s1.isDead && !s2.isDead) {
                const vote1 = ctx.votes[s1.seatNumber];
                const vote2 = ctx.votes[s2.seatNumber];
                if (vote1 !== undefined && vote2 !== undefined && vote1 === vote2 && vote1 !== 'pass') {
                    if (vote1 !== ctx.votedOutToday) {
                        ctx.nightTags = ctx.nightTags || {};
                        ctx.nightTags.succubusCurseTarget = vote1;
                        if (typeof Engine !== 'undefined' && Engine.EventBus) {
                            Engine.EventBus.emit('MASTER_LOG', `【系統紀錄】魅魔與伴侶同步票投 ${vote1} 號，觸發延遲詛咒`);
                        }
                    }
                }
            }
        }
    },

    onDawnDeathEvaluation: (ctx, player, calc, deathMap) => {
        if (ctx.nightTags?.succubusCurseTarget === player.seatNumber) {
            deathMap[player.seatNumber] = 'cursed';
            if (!ctx.nightTags.succubusLogWritten) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：${player.seatNumber} 號玩家因魅魔詛咒出局)`;
                ctx.nightTags.succubusLogWritten = true;
            }
        }
    },

    onOtherPlayerDied: (ctx, observer, deadPlayer, reason) => {
        if (ctx.succubusLovers && ctx.succubusLovers.includes(deadPlayer.seatNumber)) {
            const otherLoverSeat = ctx.succubusLovers.find(s => s !== deadPlayer.seatNumber);
            const otherLover = ctx.getPlayer(otherLoverSeat);
            if (otherLover && !otherLover.isDead) {
                ctx.systemLog = (ctx.systemLog || '') + `\n(系統紀錄：魅魔伴侶 ${deadPlayer.seatNumber} 號出局，${otherLoverSeat} 號隨之殉情)`;
                otherLover.kill('martyr', ctx);
            }
        }
    },

    checkWinCondition: (ctx, player) => {
        if (!ctx.succubusLovers || ctx.succubusLovers.length < 2) return null;
        const l1 = ctx.getPlayer(ctx.succubusLovers[0]);
        const l2 = ctx.getPlayer(ctx.succubusLovers[1]);
        if (!l1 || !l2 || l1.isDead || l2.isDead) return null;

        const alive = ctx.getAlivePlayers();
        const otherAlive = alive.filter(p => p.seatNumber !== l1.seatNumber && p.seatNumber !== l2.seatNumber);
        if (otherAlive.length === 0) {
            return { winner: "第三方陣營 (魅魔)", reason: "魅魔與伴侶成功淘汰全場其他玩家" };
        } else {
            return { preventNormalWin: true };
        }
    }
});
