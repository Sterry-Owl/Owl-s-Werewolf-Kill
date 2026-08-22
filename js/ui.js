// ==========================================
// v3.8.0 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    countdownInterval: null, 
    isPreparingDaySkill: false,
    cachedDaySkillData: null, 
    originalActionPanel: null,
    getTopTagStyle: function(text) {
        const colorMap = {
            '平民': '#EAE0CF', '高級平民': '#EAE0CF', '燈影預言家': '#EAE0CF',
            '暗戀者': '#FC8EAC','野孩子': '#FC8EAC','復仇者': '#FC8EAC','吹笛者': '#FC8EAC','邱比特': '#FC8EAC','盜賊': '#66CDAA', '咒狐': '#66CDAA',
            '預言家': '#B999A7', '魔鏡少女': '#B999A7', '純白之女': '#B999A7', '熊': '#B999A7', '覺醒預言家': '#B999A7',
            '女巫': '#76ABAE', '子狐': '#76ABAE', '煉金魔女': '#73ABAE',
            '騎士': '#004030', '獵人': '#004030', '獵魔人': '#004030', '定序王子': '#004030', '河豚': '#004030', '覺醒獵人': '#004030',
            '守墓人': '#FF9851', '攝夢人': '#FF9851', '烏鴉': '#FF9851', '白痴': '#FF9851', '守衛': '#FF9851', '魔術師': '#FF9851', '奇蹟商人': '#FF9851', '流光伯爵': '#FF9851', '白晝學者': '#FF9851', '白貓': '#FF9851', '覺醒愚者': '#FF9851', '不死鳥': '#FF9851',
            '石像鬼': '#4d170d', '尋香魅影': '#4d170d', '機械狼': '#4d170d', '隱狼': '#4d170d',
            '狼巫': '#3d031a', '惡靈騎士': '#3d031a', '巫妖': '#3d031a',
            '白狼王': '#7f203b', '血月使徒': '#7f203b', '狼王': '#7f203b', '狼美人': '#7f203b', '狼鴉之爪': '#7f203b', '覺醒狼美人': '#7f203b', '夜之貴族': '#7f203b'
            '蝕時狼妃': '#853953', '噩夢之影': '#853953', '蝕日侍女': '#853953', '寂夜導師': '#853953',
            '狼人': '#7f2020'
        };

        let bg = colorMap[text];
        let color = '#fff';
        if (!bg) {
            bg = '#e8dfe0'; 
            const def = typeof ROLE_DICTIONARY !== 'undefined' ? ROLE_DICTIONARY[text] : null;
            if (def) {
                if (def.faction === 'wolf') bg = '#7f2020'; 
                else if (def.faction === 'third_party') bg = '#385a87';
            }
        }
        if (['#EAE0CF'].includes(bg)) {
            color = '#333';
        }
        return `background:${bg}; color:${color}; border: 1px solid rgba(0,0,0,0.2);`;
    },

    updateStatusMessage: function(msg) {
        const el = document.getElementById('action-prompt');
        const actionPanelEl = document.getElementById('dynamic-action-panel');
        
        if (el) {
            if (actionPanelEl && actionPanelEl.classList.contains('image-mode')) {
                return; 
            }
            el.textContent = msg;
        }
    },

    blockActionPanel: function() {
        const btnContainer = document.getElementById('dynamic-buttons-container');
        if(btnContainer) btnContainer.innerHTML = '';
        
        const promptEl = document.getElementById('action-prompt');
        const actionPanelEl = document.getElementById('dynamic-action-panel');
        
        if(promptEl) {
            if (actionPanelEl && actionPanelEl.classList.contains('image-mode')) {
            } else {
                promptEl.innerHTML = '行動已送出，等待系統確認...';
            }
        }
    
        
        clearInterval(UI.countdownInterval);
        document.querySelectorAll('.player-seat').forEach(s => {
            s.style.pointerEvents = 'none';
        });
    },
    
   playShoutAnimation: function(role) {
        let container = document.getElementById('shout-animation-container');
        // [修復] 徹底銷毀舊節點，保證每一次呼叫皆能重新觸發 CSS Keyframes
        if (container) {
            container.remove();
        }
        
        container = document.createElement('div');
        container.id = 'shout-animation-container';
        const img = document.createElement('img');
        img.id = 'shout-animation-img';
        container.appendChild(img);
        
        // [修復] 偵測當前處於「可見狀態」的活躍視圖，防止動畫注入隱藏節點
        let targetParent = document.body;
        const playerApp = document.querySelector('.player-app-container');
        const hostApp = document.querySelector('.container');
        
        if (playerApp && window.getComputedStyle(playerApp).display !== 'none') {
            targetParent = playerApp;
        } else if (hostApp && window.getComputedStyle(hostApp).display !== 'none') {
            targetParent = hostApp;
        }
        
        targetParent.appendChild(container);
        targetParent.style.position = 'relative';
        targetParent.style.overflow = 'hidden'; 
        
        const imgMap = {
            '騎士': 'shout-knight.webp',
            '白狼王': 'shout-wwk.webp',
            '定序王子': 'shout-prince.webp',
            '河豚': 'shout-pufferfish.webp'
        };
        const fileName = imgMap[role] || 'shout-default.webp';
        img.src = `./img/shout/${fileName}`;
        
        // [修復] 利用微任務延遲 (setTimeout)，等待 DOM 掛載完成後再附加動畫類別
        setTimeout(() => {
            container.classList.add('play');
        }, 10);
        
        clearTimeout(UI.shoutTimeout);
        UI.shoutTimeout = setTimeout(() => {
            const el = document.getElementById('shout-animation-container');
            if (el) el.remove(); // 動畫結束後徹底銷毀，維持 DOM 樹純淨
        }, 2500); 
    },

    renderPlayerView: function(state, onSeatSelect, onActionSubmit, selectedTargets = [], showVoteHistory = false) {
        if (state.latestAnimation) {
            if (UI.lastAnimationTime === undefined) {
                UI.lastAnimationTime = state.latestAnimation.timestamp;
            } else if (state.latestAnimation.timestamp > UI.lastAnimationTime) {
                UI.lastAnimationTime = state.latestAnimation.timestamp;
                UI.playShoutAnimation(state.latestAnimation.role);
            }
        }

        document.getElementById('player-seat-number').textContent = state.mySeat || '-';

        // ==========================================
        // [新增] 日夜場景與時間指示器動態切換
        // 精準鎖定玩家介面容器 (.app-body)，絕不污染外層全域網頁背景
        // ==========================================
        const isNightPhase = ['NIGHT_TRANSITION', 'NIGHT_ACTION', 'MIDNIGHT_RESULT_DISPLAY'].includes(state.phase);
        const playerAppBody = document.querySelector('#section-player .app-body');
        
        if (playerAppBody) {
            // 1. 動態切換容器背景
            playerAppBody.style.backgroundImage = isNightPhase ? "url('./img/bg-player-night.webp')" : "url('./img/bg-player-day.webp')";

            // 2. 動態生成與定位時間指示器
            let displayCount = state.nightCount || 0;
            if (state.phase === 'NIGHT_TRANSITION') {
                displayCount += 1;
            }

            if (state.phase !== 'LOBBY' && displayCount > 0) {
                let timeIndicator = document.getElementById('time-indicator-img');
                if (!timeIndicator) {
                    timeIndicator = document.createElement('img');
                    timeIndicator.id = 'time-indicator-img';
                    timeIndicator.className = 'time-indicator'; 
                    
                    playerAppBody.appendChild(timeIndicator);
                }
                
                const timeStr = isNightPhase ? 'night' : 'day';
                const targetSrc = `./img/time/${timeStr}${displayCount}.webp`;
                
                if (timeIndicator.getAttribute('src') !== targetSrc) {
                    timeIndicator.src = targetSrc;
                }
                timeIndicator.style.display = 'block';
            } else {
                const timeIndicator = document.getElementById('time-indicator-img');
                if (timeIndicator) timeIndicator.style.display = 'none';
            }
        }

        // ==========================================
        // [新增] 視圖攔截器 (View Interceptor)
        // 透過覆寫 DTO 狀態，無縫替換中央面板，零髒代碼
        // ==========================================
        // 1. 若伺服器傳來技能，安全更新快取
        if (state.daySkill) {
            UI.cachedDaySkillData = state.daySkill;
        }

        // 2. 攔截並覆寫面板
        if (UI.isPreparingDaySkill && UI.cachedDaySkillData) {
            // 若尚未備份原始面板，則備份之 (避免重新渲染時備份被汙染)
            if (!UI.originalActionPanel) {
                UI.originalActionPanel = state.actionPanel;
            }
            
            state.actionPanel = {
                show: true,
                type: UI.cachedDaySkillData.requiresTarget ? 'single_select' : 'none',
                prompt: `【發動技能：${UI.cachedDaySkillData.buttonText}】\n請選擇目標 (或點擊取消)`,
                selectableSeats: UI.cachedDaySkillData.selectableSeats,
                deadline: UI.originalActionPanel ? UI.originalActionPanel.deadline : null, 
                buttons: [
                    { id: 'confirm_day_skill', text: '確定發動', requiresTarget: UI.cachedDaySkillData.requiresTarget },
                    { id: 'cancel_day_skill', text: '取消', requiresTarget: false }
                ]
            };
       } else {
            // 3. 恢復或放行：取消技能時，還原原始面板狀態
            UI.isPreparingDaySkill = false;
            if (UI.originalActionPanel) {
                state.actionPanel = UI.originalActionPanel;
                UI.originalActionPanel = null;
            }
        }

        // [重構] DOM 結構已靜態化，僅需安全注入資料，不再涉入節點創建
        let boardNameEl = document.getElementById('dynamic-board-name');
        if (boardNameEl) {
            boardNameEl.textContent = state.boardName || '';
        }

        // 採用全域事件代理 (Event Delegation)，徹底根除重繪時事件脫落之 Bug
        if (!window.__boardDetailsEventBound) {
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('#btn-board-details');
                const panel = document.getElementById('board-details-panel');
                if (!panel) return;

                if (btn) {
                    e.stopPropagation();
                    const isHidden = window.getComputedStyle(panel).display === 'none';
                    panel.style.display = isHidden ? 'block' : 'none';
                } else if (!panel.contains(e.target)) {
                    panel.style.display = 'none';
                }
            });
            window.__boardDetailsEventBound = true;
        }
        let detailsPanel = document.getElementById('board-details-panel');
        if (detailsPanel) {
            const targetHash = state.boardName ? (state.boardName + JSON.stringify(state.rules || {})) : 'empty';
            const currentMountedHash = detailsPanel.getAttribute('data-current-hash');
            
            if (currentMountedHash !== targetHash) {
                detailsPanel.setAttribute('data-current-hash', targetHash);
                
                if (targetHash === 'empty' || !state.rules) {
                    detailsPanel.innerHTML = '<div style="padding:20px; text-align:center; font-size:14px; color:#ccc;">等待房主選擇版型與規則...</div>';
                } else {
                    const rulesTextMap = {
                        witchSave: { 'never': '不可', 'first_night': '首夜' },
                        winCondition: { 'kill_side': '屠邊', 'kill_all': '屠城' },
                        tieResolution: { 'pk': 'PK', 'peace': '平安' },
                        sheriff: { 'enabled': '開啟', 'disabled': '關閉' },
                        sheriffExplodeRule: { 'double': '雙爆', 'single': '單爆' },
                        deathReveal: { 'dark': '暗牌', 'light': '明牌' },
                        squareCard: { 'off': '經典', 'on': '舊日' },
                        firstNightKill: { 'enabled': '預設', 'disabled': '首夜無刀' },
                        hiddenWolfType: { 'strong': '強', 'weak': '弱' }
                    };

                    let deckHtml = '';
                    const board = typeof BOARD_TEMPLATES !== 'undefined' ? BOARD_TEMPLATES.find(t => t.name === state.boardName) : null;
                    if (board) {
                        const deck = board.deck;
                        const wolves = [], gods = [], others = [];
                        deck.forEach(role => {
                            let color = '#ccc';
                            let targetGroup = others;
                            let description = '';
                            const def = typeof ROLE_DICTIONARY !== 'undefined' ? ROLE_DICTIONARY[role] : null;
                            if (def) {
                                description = def.description || '';
                                if (def.faction === 'wolf') { color = '#9e646a'; targetGroup = wolves; }
                                else if (def.type === 'god') { color = '#c4a75c'; targetGroup = gods; }
                                else if (def.type === 'villager') { color = '#6a8c6e'; targetGroup = others; }
                                else if (def.faction === 'third_party') { color = '#8a7096'; targetGroup = others; }
                            }
                            targetGroup.push(`<span class="role-tooltip-trigger" data-role-name="${role}" data-role-desc="${description}" style="color:${color}; font-weight:bold;">${role}</span>`);
                        });
                        const renderLine = (arr) => arr.length > 0 ? `<div style="white-space:nowrap; margin-bottom:1px;">${arr.join('<span style="color:#555; margin:0 2px;">、</span>')}</div>` : '';
                        deckHtml = `
                            <div class="role-preview-inner" style="margin: 0 auto; line-height:1.4; display:flex; flex-direction:column; align-items:flex-start; width:fit-content;">
                                ${renderLine(wolves)}
                                ${renderLine(gods)}
                                ${renderLine(others)}
                            </div>
                        `;
                    }

                    const r = state.rules;
                    const rulesHtml = `
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size:12px; color:#bbb; text-align:center;">
                            <!-- [修正] 移除所有 grid-column: span 2，達成寬度絕對統一，並新增隱狼類型 -->
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">發言時長：<span style="color:#fff;">${r.speechTime}s</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">首夜襲擊：<span style="color:#fff;">${rulesTextMap.firstNightKill[r.firstNightKill] || r.firstNightKill}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">女巫自救：<span style="color:#fff;">${rulesTextMap.witchSave[r.witchSave] || r.witchSave}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">勝利條件：<span style="color:#fff;">${rulesTextMap.winCondition[r.winCondition] || r.winCondition}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">警長機制：<span style="color:#fff;">${rulesTextMap.sheriff[r.sheriff] || r.sheriff}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">吞警徽：<span style="color:#fff;">${rulesTextMap.sheriffExplodeRule[r.sheriffExplodeRule] || r.sheriffExplodeRule}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">身分揭曉：<span style="color:#fff;">${rulesTextMap.deathReveal[r.deathReveal] || r.deathReveal}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">卡面樣式：<span style="color:#fff;">${rulesTextMap.squareCard[r.squareCard] || r.squareCard}</span></div>
                            <div style="background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">隱狼類型：<span style="color:#fff;">${rulesTextMap.hiddenWolfType[r.hiddenWolfType] || r.hiddenWolfType}</span></div>
                        </div>
                    `;

                    detailsPanel.innerHTML = `
                        <div style="padding:20px;">
                            <div style="color:var(--accent-blue); font-size:14px; font-weight:bold; margin-bottom:12px; text-align:center; border-bottom:1px solid #444; padding-bottom:6px;">${state.boardName}</div>
                            <div style="display:flex; justify-content:center; align-items:center; flex-direction:column; font-size:12px;">${deckHtml}</div>
                            <div style="color:var(--accent-blue); font-size:14px; font-weight:bold; margin-bottom:12px; margin-top:20px; text-align:center; border-bottom:1px solid #444; padding-bottom:6px;">遊戲規則</div>
                            ${rulesHtml}
                        </div>
                    `;
                }
            }
        }
        const btnExplode = document.getElementById('btn-self-explode');
        const btnWolfChat = document.getElementById('btn-wolf-chat');
        if (btnExplode) {
            btnExplode.textContent = ''; 
            if (state.allowSelfExplode) btnExplode.classList.remove('hidden');
            else btnExplode.classList.add('hidden');
        }
        if (btnWolfChat) {
            btnWolfChat.textContent = ''; 
            if (state.canUseWolfChat) {
                btnWolfChat.classList.remove('hidden');
                btnWolfChat.onclick = () => UI.openWolfChatModal(state);
            } else {
                btnWolfChat.classList.add('hidden');
            }
        }
        const btnBailout = document.getElementById('btn-bailout');
        if (btnBailout) {
            btnBailout.textContent = ''; 
            if (state.allowBailout) btnBailout.classList.remove('hidden');
            else btnBailout.classList.add('hidden');
        }
        const btnEndSpeech = document.getElementById('btn-end-speech');
        if (btnEndSpeech) {
            btnEndSpeech.textContent = '';
            if (state.allowEndSpeech) {
                btnEndSpeech.classList.remove('hidden');
                btnEndSpeech.onclick = () => onActionSubmit('end_speech');
            } else {
                btnEndSpeech.classList.add('hidden');
            }
        }
        const btnHistory = document.getElementById('btn-vote-history');
        if (btnHistory) {
            btnHistory.textContent = ''; 
            if (state.voteHistory && state.voteHistory.length > 0) btnHistory.classList.remove('hidden');
            else btnHistory.classList.add('hidden');
        }
        
        // [新增] 房主控制列與除錯按鈕顯示邏輯
        const btnHostSettings = document.getElementById('btn-host-settings');
        const btnBoardDetails = document.getElementById('btn-board-details'); // 加入詳情按鈕的 DOM 索引

        if (state.isLocalHost) {
            // 房主專屬設定按鈕常駐顯示，並隱藏詳情按鈕
            if (btnHostSettings) btnHostSettings.classList.remove('hidden');
            if (btnBoardDetails) btnBoardDetails.classList.add('hidden');
            
            // 更新 Modal 內的控制按鈕狀態
            const btnHostAction = document.getElementById('btn-local-host-action');
            const btnForceNext = document.getElementById('btn-local-force-next');
            if (state.hostActions) {
                if (state.hostActions.text && !state.hostActions.disabled) {
                    if (btnHostAction) {
                        btnHostAction.classList.remove('hidden');
                        btnHostAction.textContent = state.hostActions.text;
                        btnHostAction.onclick = () => { 
                            if (window.handleHostCommand) window.handleHostCommand(state.hostActions.command);
                            // 點擊後自動關閉 Modal
                            const modal = document.getElementById('host-control-modal');
                            if (modal) modal.classList.add('hidden');
                        };
                    }
                } else {
                    if (btnHostAction) btnHostAction.classList.add('hidden');
                }
                
                if (state.hostActions.allowForceNext) {
                    if (btnForceNext) {
                        btnForceNext.classList.remove('hidden');
                        btnForceNext.onclick = () => { 
                            if (window.handleHostCommand) window.handleHostCommand('FORCE_NEXT'); 
                            // 點擊後自動關閉 Modal
                            const modal = document.getElementById('host-control-modal');
                            if (modal) modal.classList.add('hidden');
                        };
                    }
                } else {
                    if (btnForceNext) btnForceNext.classList.add('hidden');
                }
            }
        } else {
            if (btnHostSettings) btnHostSettings.classList.add('hidden');
            if (btnBoardDetails) btnBoardDetails.classList.remove('hidden');
        }

        const btnDaySkill = document.getElementById('btn-day-skill');

        const localPanel = document.getElementById('local-day-skill-panel');
        if (localPanel) localPanel.remove(); 

        if (btnDaySkill) {
            if (state.daySkill && !UI.isPreparingDaySkill) { 
                btnDaySkill.classList.remove('hidden');
                const daySkillIconMap = {
                    '騎士': 'btn-knight.webp',
                    '河豚': 'btn-fish.webp',
                    '定序王子': 'btn-prince.webp',
                    '白狼王': 'btn-explode.webp'
                };
                const iconFile = daySkillIconMap[state.myRole] || 'btn-explode.webp';
                btnDaySkill.style.backgroundImage = `url('./img/${iconFile}')`;
                btnDaySkill.onclick = () => {
                    UI.isPreparingDaySkill = true;
                    UI.renderPlayerView(state, onSeatSelect, onActionSubmit, [], showVoteHistory);
                };
            } else {
                btnDaySkill.classList.add('hidden');
            }
        }
        const cardPanel = document.querySelector('.card-panel');
        const cardContainer = document.getElementById('my-card-container');
        const historyPanel = document.getElementById('vote-history-panel');

        if (showVoteHistory) {
            // 1. 提高圖層層級
            if (cardPanel) cardPanel.style.zIndex = '25';
            
            // 2. 隱藏角色 3D 卡牌 (刪除引發 ReferenceError 的 btnRoleDetails 邏輯)
            if (cardContainer) cardContainer.classList.add('hidden');
            
            // 3. 顯示並渲染票型紀錄
            if (historyPanel) {
                historyPanel.classList.remove('hidden');
                
                // [防禦性編程] 確保 voteHistory 存在且為陣列，防止報錯導致崩潰
                const historyData = Array.isArray(state.voteHistory) ? state.voteHistory : [];
                
                if (historyData.length > 0) {
                    historyPanel.innerHTML = historyData.map(h => `<div style="margin-bottom:8px; border-bottom:1px solid #444; padding-bottom:5px; white-space:pre-wrap;">${h}</div>`).join('');
                } else {
                    historyPanel.innerHTML = '<div style="color: #aaa; text-align: center; margin-top: 20px;">尚無投票紀錄</div>';
                }
            }
        } else {
            // 1. 恢復圖層層級
            if (cardPanel) cardPanel.style.zIndex = '15';
            
            // 2. 隱藏票型紀錄
            if (historyPanel) historyPanel.classList.add('hidden');
            
            // 3. 顯示並更新角色 3D 卡牌
            if (cardContainer && state.myRole) {
                const def = ROLE_DICTIONARY[state.myRole];
                const displayRoleName = (def && def.displayName) ? def.displayName : state.myRole;
                
                const headerRoleEl = document.getElementById('player-role-name');
                if (headerRoleEl) headerRoleEl.textContent = displayRoleName;
                const baseRoleName = state.myRole.split(/[-()]/)[0].trim();
                const imgEl = document.getElementById('my-card-img');
                
                const imgDir = state.useSquareCard ? './img/square' : './img';
                if (state.useSquareCard) {
                    cardContainer.classList.add('is-square');
                } else {
                    cardContainer.classList.remove('is-square');
                }
                
                imgEl.onerror = null;
                imgEl.onerror = function() { 
                    this.onerror = function() {
                        this.onerror = null;
                        this.src = './img/back.webp'; 
                    };
                    this.src = `${imgDir}/back.webp`; 
                }; 
                imgEl.src = `${imgDir}/${baseRoleName}.webp`;
                
                document.getElementById('role-desc-title').textContent = displayRoleName;
                document.getElementById('role-desc-content').textContent = def ? def.description : '無技能說明。';
                
                cardContainer.classList.remove('hidden');
            }
        }

        // ===============================================
        // [升級] 動態號碼槽生成系統 (Dynamic Target Slots)
        // ===============================================
        const slotsContainer = document.getElementById('target-slots-container');
        const actionPanelEl = document.getElementById('dynamic-action-panel');
        if (actionPanelEl) {
            if (state.actionPanel && state.actionPanel.bgImage) {
                actionPanelEl.classList.add('image-mode');
                actionPanelEl.style.backgroundImage = `url('./img/act/${state.actionPanel.bgImage}.webp')`;
            } else {
                actionPanelEl.classList.remove('image-mode');
                actionPanelEl.style.backgroundImage = 'none';
            }
        }
        const displayTargets = (state.actionPanel && (state.actionPanel.hasActed || state.actionPanel.forceTargets) && state.actionPanel.submittedTargets) 
            ? state.actionPanel.submittedTargets 
            : selectedTargets;

        if (slotsContainer) {
            slotsContainer.innerHTML = ''; 
            if (state.actionPanel && state.actionPanel.show && (state.actionPanel.type !== 'none' || state.actionPanel.forceTargets) && state.actionPanel.type !== 'thief_pick') {
                slotsContainer.classList.remove('hidden');

                if (state.actionPanel.type === 'triple_select') {
                    slotsContainer.classList.add('triple-mode');
                } else {
                    slotsContainer.classList.remove('triple-mode');
                }

                const createSlot = (seatNum, labelText, specialClass) => {
                    const slot = document.createElement('div');
                    slot.className = 'target-slot' + (seatNum ? ' filled' : '');
                    
                    if (seatNum) {
                        const img = document.createElement('img');
                        img.src = `./img/seat_${seatNum}.webp`;
                        img.onerror = function() { this.style.display='none'; };
                        slot.appendChild(img);
                    }
                    
                    if (labelText) {
                        const label = document.createElement('div');
                        label.className = 'target-slot-label';
                        if (specialClass) label.classList.add(specialClass);
                        label.textContent = labelText;
                        slot.appendChild(label);
                    }
                    slotsContainer.appendChild(slot);
                };

                if (state.myRole === '女巫' && state.phase === 'NIGHT_ACTION') {
                    const victim = state.actionPanel.preSelectedTarget;
                    createSlot(victim, victim ? '解藥 (刀口)' : '解藥 (空)', 'antidote');
                    
                    const poisonTarget = displayTargets.length > 0 ? displayTargets[0] : null;
                    createSlot(poisonTarget, poisonTarget ? '毒藥' : '選擇毒藥目標', 'poison');
                } else if (state.actionPanel.forceTargets) {
                    if (displayTargets.length === 0) {
                        slotsContainer.classList.add('hidden');
                    } else {
                        // [語法修復] 補回遺失的迴圈宣告，解決白屏崩潰
                        displayTargets.forEach(target => {
                            let alignmentLabel = '';
                            let specialClass = '';
                            const tData = state.players.find(p => p.seatNumber === target);
                            if (tData && tData.sideTag) {
                                alignmentLabel = tData.sideTag;
                                if (alignmentLabel === '狼人' || alignmentLabel === '疑似狼人') specialClass = 'wolf';
                                else if (alignmentLabel === '好人') specialClass = 'good';
                                else if (alignmentLabel === '警長') specialClass = 'sheriff';
                                else if (alignmentLabel === '銀水') specialClass = 'silver';
                            }
                            createSlot(target, alignmentLabel, specialClass);
                        });
                    }

                } else if (state.actionPanel.type === 'triple_select') {
                    createSlot(displayTargets[0] || null, '目標 1', '');
                    createSlot(displayTargets[1] || null, '目標 2', '');
                    createSlot(displayTargets[2] || null, '目標 3', '');
                } else if (state.actionPanel.type === 'double_select' || state.actionPanel.type === 'up_to_two') {
                    createSlot(displayTargets[0] || null, '目標 1', '');
                    createSlot(displayTargets[1] || null, '目標 2', '');
                } else {
                    const target = displayTargets.length > 0 ? displayTargets[0] : null;
                    let alignmentLabel = target ? '' : '請選擇';
                    let specialClass = '';
                    
                    if (target) {
                        const tData = state.players.find(p => p.seatNumber === target);
                        if (tData && tData.sideTag) {
                            alignmentLabel = tData.sideTag;
                            if (alignmentLabel === '狼人' || alignmentLabel === '疑似狼人') specialClass = 'wolf';
                            else if (alignmentLabel === '好人') specialClass = 'good';
                            else if (alignmentLabel === '警長') specialClass = 'sheriff';
                            else if (alignmentLabel === '銀水') specialClass = 'silver';
                        }
                    }
                    createSlot(target, alignmentLabel, specialClass);
                }
            } else {
                slotsContainer.classList.add('hidden');
            }
        }

        // ===============================================
        // [新增] 渲染特殊資訊區域 (Special Info Panel)
        // 完全不帶角色邏輯，純資料驅動 DOM 掛載
        // ===============================================
        let specialInfoContainer = document.getElementById('special-info-container');
        if (!specialInfoContainer) {
            specialInfoContainer = document.createElement('div');
            specialInfoContainer.id = 'special-info-container';
            specialInfoContainer.className = 'special-info-container hidden';
            
            // 緊貼在操作面板之下掛載
            if (actionPanelEl && actionPanelEl.parentNode) {
                actionPanelEl.parentNode.insertBefore(specialInfoContainer, actionPanelEl.nextSibling);
            }
        }

        if (state.specialInfos && state.specialInfos.length > 0) {
            specialInfoContainer.innerHTML = state.specialInfos.map(info => `
                <div class="special-info-item">
                    <div class="special-info-main">${info.text}</div>
                    <div class="special-info-sub">${info.subtext}</div>
                </div>
            `).join('');
            specialInfoContainer.classList.remove('hidden');
        } else {
            specialInfoContainer.innerHTML = '';
            specialInfoContainer.classList.add('hidden');
        }

        const leftSeats = document.getElementById('left-seats');
        const rightSeats = document.getElementById('right-seats');
        if (!leftSeats || !rightSeats) return;
        leftSeats.innerHTML = '';
        rightSeats.innerHTML = '';

        state.players.forEach((p) => {
            const seat = document.createElement('div');
            seat.className = 'player-seat';
            
            if (p.isDead) {
                seat.classList.add('dead');
                const reason = (p.deathReason === 'voted' || p.deathReason === 'explode') ? p.deathReason : 'killed';
                seat.setAttribute('data-death-reason', reason);
            }
            
            if (p.isWolfSelected) seat.classList.add('wolf-selected');
            
            const isSelected = displayTargets.includes(p.seatNumber);
            if (isSelected) seat.classList.add('selected');
            
            if (state.actionPanel.show && state.actionPanel.selectableSeats.includes(p.seatNumber) && state.actionPanel.buttons && state.actionPanel.buttons.length > 0) {
                seat.classList.add('selectable-target');
                seat.style.cursor = 'pointer';
                seat.style.pointerEvents = 'auto';
                seat.addEventListener('click', () => onSeatSelect(p.seatNumber));
            } else {
                seat.classList.remove('selectable-target');
                seat.style.pointerEvents = 'none';
                seat.style.cursor = 'default';
            }

            let tagsHtml = '';
            
            // 恢復 PK 圓點的無附加 Class 渲染，交由 CSS 統一處理右下角圓周定位
            if (p.isPKTarget) {
                tagsHtml += `<div class="pk-dot"></div>`;
            } else if (p.isCandidate) {
                tagsHtml += `<div class="candidate-dot"></div>`;
            } else if (p.hasWithdrawn) {
                tagsHtml += `<div class="candidate-dot withdrawn"></div>`;
            }

            if (p.topTag) {
                const styleStr = UI.getTopTagStyle(p.topTag);
                tagsHtml += `<div class="top-tag" style="${styleStr}">${p.topTag}</div>`;
            }
            
            if (p.sideTag) {
                const alignClass = p.seatNumber <= 6 ? 'align-right' : 'align-left';
                let colorClass = 'tag-default';
                if (p.sideTag === '銀水') colorClass = 'tag-silver';
                else if (p.sideTag === '好人') colorClass = 'tag-gold';
                else if (p.sideTag === '狼人' || p.sideTag === '疑似狼人') colorClass = 'tag-red';
                else if (p.sideTag === '暗戀對象') colorClass = 'tag-pink';
                else if (p.sideTag === '被誘引') colorClass = 'tag-purple';

                tagsHtml += `<div class="side-tag ${alignClass} ${colorClass}">${p.sideTag}</div>`;
            }

            // [修改] 拔除 Inline CSS，改呼叫外部樣式類別
            if (p.isSheriff) {
                tagsHtml += `<div class="sheriff-diamond"></div>`;
            }

            if (p.wolfPreviewTags && p.wolfPreviewTags.length > 0) {
                p.wolfPreviewTags.forEach((tag, idx) => {
                    tagsHtml += `<div class="wolf-preview-tag" style="bottom: ${-12 - (idx*16)}px;">${tag}</div>`;
                });
            }

            seat.innerHTML = `
                <div class="seat-container" style="position:relative; width:46px; height:46px; flex-shrink:0;">
                    <div class="seat-img-wrapper">
                        <img src="./img/seat_${p.seatNumber}.webp" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:18px; font-weight:bold; color:#333;">${p.seatNumber}</div>
                    </div>
                    ${tagsHtml}
                </div>
                <div class="player-name">${p.name || '等待加入'}</div>
            `;

            if (p.seatNumber <= 6) {
                leftSeats.appendChild(seat);
            } else {
                rightSeats.appendChild(seat);
            }
        });

        const promptEl = document.getElementById('action-prompt');
        const btnContainer = document.getElementById('dynamic-buttons-container');
        
        clearInterval(UI.countdownInterval); 

        if (state.actionPanel.show) {
            if (state.actionPanel.deadline) {
                if(promptEl) {
                    promptEl.innerHTML = `<div id="action-timer-display" class="action-timer">--</div><div style="margin-top:8px; white-space:pre-wrap;">${state.actionPanel.prompt}</div>`;
                }
                const timerDisplay = document.getElementById('action-timer-display');
                
                UI.countdownInterval = setInterval(() => {
                    const now = Date.now();
                    const remain = Math.max(0, Math.ceil((state.actionPanel.deadline - now) / 1000));
                    if (timerDisplay) {
                        const dirPrefix = state.actionPanel.speakingDirection ? `[${state.actionPanel.speakingDirection}序] ` : "";
                        timerDisplay.textContent = dirPrefix + remain + 's';
                        if (remain <= 5) timerDisplay.style.color = 'var(--accent-red)';
                    }
                    if (remain <= 0) clearInterval(UI.countdownInterval);
                }, 200);
            } else {
                if(promptEl) promptEl.textContent = state.actionPanel.prompt;
            }
            
            if (btnContainer) {
                btnContainer.innerHTML = '';
                if (state.actionPanel.buttons && state.actionPanel.buttons.length > 0) {
                    // [新增] 盜賊專屬圖片選擇介面
                    if (state.actionPanel.type === 'thief_pick') {
                        const cardsWrapper = document.createElement('div');
                        cardsWrapper.style.display = 'flex';
                        cardsWrapper.style.justifyContent = 'center';
                        cardsWrapper.style.gap = '25px';
                        cardsWrapper.style.marginTop = '10px';
                        cardsWrapper.style.marginBottom = '10px';

                        state.actionPanel.buttons.forEach(bInfo => {
                            const imgDir = state.useSquareCard ? './img/square' : './img';
                            const cardImg = document.createElement('img');
                            cardImg.src = `${imgDir}/${bInfo.cardName}.webp`;
                            
                            // 延續系統標準的雙層防呆圖片載入機制
                            cardImg.onerror = function() { 
                                this.onerror = function() {
                                    this.onerror = null;
                                    this.src = './img/back.webp'; 
                                };
                                this.src = `${imgDir}/back.webp`; 
                            };

                            // 動態卡牌樣式
                            cardImg.style.width = '110px';
                            cardImg.style.height = 'auto';
                            cardImg.style.borderRadius = state.useSquareCard ? '4px' : '8px';
                            cardImg.style.boxShadow = '0 6px 15px rgba(0,0,0,0.5)';
                            cardImg.style.transition = 'transform 0.2s';
                            
                            if (bInfo.isLocked) {
                                cardImg.style.filter = 'grayscale(100%) brightness(40%)';
                                cardImg.style.cursor = 'not-allowed';
                            } else {
                                cardImg.style.cursor = 'pointer';
                                cardImg.onmouseover = () => cardImg.style.transform = 'scale(1.05)';
                                cardImg.onmouseout = () => cardImg.style.transform = 'scale(1)';
                                cardImg.onclick = () => onActionSubmit(bInfo.id);
                            }
                            
                            cardsWrapper.appendChild(cardImg);
                        });
                        btnContainer.appendChild(cardsWrapper);
                    } else {
                        state.actionPanel.buttons.forEach(bInfo => {
                            const btn = document.createElement('button');
                            btn.textContent = bInfo.text;
                            
                            if (bInfo.id === 'pass' || bInfo.id === 'cancel_day_skill') {
                            btn.className = 'btn-secondary';
                            if (state.actionPanel.passTags && state.actionPanel.passTags.length > 0) {
                                btn.style.position = 'relative';
                                state.actionPanel.passTags.forEach((tag, idx) => {
                                    btn.innerHTML += `<div class="wolf-preview-tag" style="top: -15px; right: ${-10 + (idx*20)}px;">${tag}</div>`;
                                });
                            }
                        }
                        else if (bInfo.id === 'poison') {
                            btn.style.background = '#aa68b0'; 
                        }
                        else if (bInfo.id === 'end_speech') {
                            // [新增] 結束發言設定為灰色次要按鈕，降低誤觸率
                            btn.className = 'btn-secondary'; 
                        }
                        else if (bInfo.id === 'order_left' || bInfo.id === 'order_right') {
                            btn.className = 'btn-success'; 
                        }
                        else if (bInfo.id === 'confirm_day_skill') {
                            btn.className = 'btn-primary';
                            btn.style.background = '#aa68b0';
                        }
                        else {
                            btn.className = 'btn-primary';
                        }

                        if (bInfo.requiresTarget) {
                            if (state.actionPanel.type === 'triple_select' && selectedTargets.length < 3) {
                                btn.disabled = true;
                            } else if (state.actionPanel.type === 'double_select' && selectedTargets.length < 2) {
                                btn.disabled = true;
                            } else if (state.actionPanel.type === 'up_to_two' && selectedTargets.length === 0) {
                                btn.disabled = true; 
                            } else if (state.actionPanel.type !== 'double_select' && state.actionPanel.type !== 'up_to_two' && selectedTargets.length === 0) {
                                btn.disabled = true;
                            }
                        }

                        btn.onclick = () => {
                            if (bInfo.id === 'cancel_day_skill') {
                                UI.isPreparingDaySkill = false;
                                // [修復] 重新渲染，頂部的攔截器會自動從 originalActionPanel 安全恢復原始面板狀態
                                UI.renderPlayerView(state, onSeatSelect, onActionSubmit, [], showVoteHistory);
                            } else if (bInfo.id === 'confirm_day_skill') {
                                UI.isPreparingDaySkill = false;
                                // 發送特殊識別碼，交由 player.js 解耦合發送
                                onActionSubmit('SPECIAL_DAY_SKILL_SUBMIT', UI.cachedDaySkillData.id);
                            } else {
                                onActionSubmit(bInfo.id);
                            }
                        };
                        btnContainer.appendChild(btn);
                    });
                    }
                }
            }
        } else {
            if(promptEl) promptEl.textContent = state.message || '等待系統指示...';
            if(btnContainer) btnContainer.innerHTML = '';
        }

        const chatModal = document.getElementById('wolf-chat-modal');
        const chatLogs = document.getElementById('wolf-chat-logs');
        if (chatModal && !chatModal.classList.contains('hidden') && chatLogs) {
            const history = state.wolfChatHistory || [];
            chatLogs.innerHTML = history.map(log => {
                return `<div style="margin-bottom: 6px;">
                            <span style="color: #ff8888; font-weight: bold;">[${log.seatNumber}號]</span> 
                            <span style="color: #fff;">${log.text}</span>
                        </div>`;
            }).join('');
            chatLogs.scrollTop = chatLogs.scrollHeight;
        }
    },

    renderHostView: function(state) {
        const setupContent = document.getElementById('host-setup-content');
        const actionContent = document.getElementById('host-action-content');
        const setupTitle = document.getElementById('host-setup-title');
        
        if (state.layout.showSetupPanel) {
            if (setupContent) setupContent.classList.remove('hidden');
            if (actionContent) actionContent.classList.add('hidden');
            if (setupTitle) setupTitle.style.display = 'block';
        } else {
            if (setupContent) setupContent.classList.add('hidden');
            if (actionContent) actionContent.classList.remove('hidden');
            if (setupTitle) setupTitle.style.display = 'none';
        }

        const statusLog = document.getElementById('host-status-log');
        if (statusLog) statusLog.textContent = state.systemLog || '等待中...';

        const logContent = document.getElementById('host-master-log-content');
        if (logContent) {
            if (state.masterLog && state.masterLog.length > 0) {
                logContent.innerHTML = state.masterLog.map(log => `<div style="margin-bottom:8px; border-bottom:1px dashed #444; padding-bottom:6px;">${log}</div>`).join('');
            } else {
                logContent.innerHTML = '<div style="color:#777; text-align:center; margin-top:20px;">遊戲尚未產生紀錄</div>';
            }
        }
    }
};
UI.openWolfChatModal = function(state) {
    const modal = document.getElementById('wolf-chat-modal');
    const logsContainer = document.getElementById('wolf-chat-logs');
    const inputField = document.getElementById('wolf-chat-input');
    const btnSend = document.getElementById('btn-wolf-chat-send');
    const lockNotice = document.getElementById('wolf-chat-lock-notice');
    const closeBtn = document.getElementById('close-wolf-chat-btn');

    if (!modal) {
        console.error("無法開啟：找不到通訊視窗的 DOM 節點");
        return;
    }

    // [修正] 關閉視窗時：同時寫入行內樣式與 CSS 類別
    closeBtn.onclick = () => {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    };

    // 讀寫分離控制 (依賴 DTO)
    if (state.isMidnight) {
        inputField.disabled = false;
        btnSend.disabled = false;
        lockNotice.style.display = 'none';
        
        inputField.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnSend.click();
            }
        };

        btnSend.onclick = () => {
            const text = inputField.value.trim();
            if (!text) return;
            window.dispatchEvent(new CustomEvent('WOLF_CHAT_OUTGOING', { detail: text }));
            inputField.value = '';
        };
    } else {
        inputField.disabled = true;
        btnSend.disabled = true;
        btnSend.onclick = null;
        lockNotice.style.display = 'block';
    }

    const history = state.wolfChatHistory || [];
    logsContainer.innerHTML = history.map(log => {
        return `<div style="margin-bottom: 6px;">
                    <span style="color: #ff8888; font-weight: bold;">[${log.seatNumber}號]</span> 
                    <span style="color: #fff;">${log.text}</span>
                </div>`;
    }).join('');

    modal.style.display = 'block';
    modal.classList.remove('hidden');
    
    setTimeout(() => logsContainer.scrollTop = logsContainer.scrollHeight, 10);
};
UI.initRulePagination = function() {
    const btnPrev = document.getElementById('btn-prev-rules-page');
    const btnNext = document.getElementById('btn-next-rules-page');
    const page1 = document.getElementById('rules-page-1');
    const page2 = document.getElementById('rules-page-2');
    const indicator = document.getElementById('rules-page-indicator');
    const title = document.getElementById('rule-section-title');

    if (!btnPrev || !btnNext || !page1 || !page2) return;

    let currentPage = 1;
    const totalPages = 2;

    const updateView = () => {
        if (currentPage === 1) {
            page1.style.display = ''; // 恢復 CSS Grid 預設顯示
            page2.style.display = 'none';
            title.textContent = '遊戲規則設定';
            btnPrev.disabled = true;
            btnNext.disabled = false;
        } else {
            page1.style.display = 'none';
            page2.style.display = '';
            title.textContent = '擴充規則設定';
            btnPrev.disabled = false;
            btnNext.disabled = true;
        }
        indicator.textContent = `${currentPage} / ${totalPages}`;
    };

    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateView();
        }
    });

    btnNext.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateView();
        }
    });
};

document.addEventListener('DOMContentLoaded', UI.initRulePagination);
UI.initRoleTooltip = function() {
    const tooltip = document.getElementById('global-role-tooltip');
    if (!tooltip) return;

    const showTooltip = (target) => {
        const name = target.getAttribute('data-role-name');
        const desc = target.getAttribute('data-role-desc');
        if (!name || !desc) return;

        tooltip.innerHTML = `<div style="color:var(--wolf-yellow); font-weight:bold; margin-bottom:4px; border-bottom:1px solid #444; padding-bottom:2px;">${name}</div><div>${desc}</div>`;
        tooltip.style.display = 'block';

        // 絕對定位與邊界防溢出運算
        const rect = target.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);

        if (left < 10) left = 10;
        if (left + tooltip.offsetWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltip.offsetWidth - 10;
        }
        if (top + tooltip.offsetHeight > window.innerHeight - 10) {
            top = rect.top - tooltip.offsetHeight - 8; // 空間不足時向上顯示
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    };

    const hideTooltip = () => {
        tooltip.style.display = 'none';
    };

    // 電腦端：滑鼠移入移出
    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.role-tooltip-trigger');
        if (target) showTooltip(target);
    });
    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('.role-tooltip-trigger');
        if (target) hideTooltip();
    });

    // 行動裝置：觸控點擊與全域關閉
    document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('.role-tooltip-trigger');
        if (target) {
            showTooltip(target);
        } else {
            hideTooltip();
        }
    }, { passive: true });
};

document.addEventListener('DOMContentLoaded', UI.initRoleTooltip);
