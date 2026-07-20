// ==========================================
// v3.8.0 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    countdownInterval: null, 

    getTopTagStyle: function(text) {
        let bg = 'var(--accent-blue)'; 
        let color = '#fff';
        const def = typeof ROLE_DICTIONARY !== 'undefined' ? ROLE_DICTIONARY[text] : null;
        
        if (def) {
            if (def.faction === 'wolf') bg = '#e57373'; 
            else if (text === '預言家' || text === '燈影預言家' || text === '魔鏡少女') bg = '#b28dd6'; 
            else if (text === '平民' || text === '暗戀者') { bg = '#f5f5f5'; color = '#333'; } 
            else if (text === '獵人') bg = '#81c784'; 
        } else {
            if (text === '狼人') bg = '#e57373';
            else if (text === '平民') { bg = '#f5f5f5'; color = '#333'; }
            else if (text === '預言家') bg = '#b28dd6';
            else if (text === '獵人') bg = '#81c784';
        }
        return `background:${bg}; color:${color}; border: 1px solid rgba(0,0,0,0.2);`;
    }, 

    updateStatusMessage: function(msg) {
        const el = document.getElementById('action-prompt');
        if (el) el.textContent = msg;
    },

    blockActionPanel: function() {
        const btnContainer = document.getElementById('dynamic-buttons-container');
        if(btnContainer) btnContainer.innerHTML = '';
        const promptEl = document.getElementById('action-prompt');
        if(promptEl) {
            promptEl.innerHTML = '行動已送出，等待系統結算...';
        }
        clearInterval(UI.countdownInterval);
        document.querySelectorAll('.player-seat').forEach(s => {
            s.style.pointerEvents = 'none';
        });
        const slotsContainer = document.getElementById('target-slots-container');
        if (slotsContainer) {
            setTimeout(() => {
                if (promptEl && promptEl.innerHTML.includes('等待系統結算')) {
                    slotsContainer.classList.add('hidden');
                }
            }, 1500);
        }
    },

    renderPlayerView: function(state, onSeatSelect, onActionSubmit, selectedTargets = [], showVoteHistory = false) {
        document.getElementById('player-seat-number').textContent = state.mySeat || '-';


        let headerEl = document.querySelector('.app-header');
        if (headerEl) {
            let boardNameEl = document.getElementById('dynamic-board-name');
            if (!boardNameEl) {
                boardNameEl = document.createElement('div');
                boardNameEl.id = 'dynamic-board-name';
                boardNameEl.style.flex = '1';
                boardNameEl.style.textAlign = 'center';
                boardNameEl.style.color = '#fff';
                boardNameEl.style.fontSize = '13px';
                headerEl.insertBefore(boardNameEl, headerEl.children[1]);
            }
            boardNameEl.textContent = state.boardName || '';
        }
        const roleNameEl = document.getElementById('player-role-name');
        let detailsBtn = document.getElementById('btn-board-details');
        let detailsPanel = document.getElementById('board-details-panel');

        // 1. 初始化 DOM 結構與事件 (保證生命週期內只執行一次)
        if (roleNameEl && !detailsBtn) {
            const parent = roleNameEl.parentElement;
            if (parent) {
                parent.innerHTML = ''; 
                const newRoleNameEl = document.createElement('span');
                newRoleNameEl.id = 'player-role-name';
                newRoleNameEl.textContent = '等待發牌';
                
                detailsBtn = document.createElement('span');
                detailsBtn.id = 'btn-board-details';
                detailsBtn.className = 'btn-board-details';
                detailsBtn.textContent = '版型詳情 ℹ️';
                parent.style.display = 'flex';
                parent.style.alignItems = 'center';
                parent.style.gap = '15px';
                parent.appendChild(newRoleNameEl);
                parent.appendChild(detailsBtn);

                detailsPanel = document.createElement('div');
                detailsPanel.id = 'board-details-panel';
                detailsPanel.className = 'board-details-panel';
                detailsPanel.style.display = 'none'; 
                
                const appContainer = document.querySelector('.player-app-container');
                if (appContainer) {
                    appContainer.appendChild(detailsPanel);
                } else {
                    document.body.appendChild(detailsPanel);
                }

                // 綁定事件 (僅綁定一次，防止 Memory Leak)
                detailsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    detailsPanel.style.display = detailsPanel.style.display === 'none' ? 'block' : 'none';
                });
                document.addEventListener('click', (e) => {
                    if (e.target.id !== 'btn-board-details' && !detailsPanel.contains(e.target)) {
                        detailsPanel.style.display = 'none';
                    }
                });
            }
        }

        // 2. 僅更新資料內容 (每次狀態同步時觸發，不破壞 DOM)
        if (detailsPanel && state.boardName) {
            // 讀取面板上目前記錄的版型名稱
            const currentMountedBoard = detailsPanel.getAttribute('data-current-board');
            
            // [純淨架構] 只有當「尚未掛載」或「版型更換」時，才執行 DOM 渲染
            if (currentMountedBoard !== state.boardName) {
                // 將最新的版型名稱寫入標籤記憶
                detailsPanel.setAttribute('data-current-board', state.boardName);
                
                // 渲染圖片，並保留 onerror 防呆機制
                detailsPanel.innerHTML = `<img src="./img/info/${state.boardName}.webp" alt="${state.boardName}" style="width:100%; height:auto; display:block; border-radius:4px;" onerror="this.parentElement.innerHTML='<div style=\\'padding:20px; text-align:center; font-size:14px;\\'>找不到對應的版型圖片：<br>${state.boardName}.webp</div>';">`;
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

        const btnHistory = document.getElementById('btn-vote-history');
        if (btnHistory) {
            btnHistory.textContent = ''; 
            if (state.voteHistory && state.voteHistory.length > 0) btnHistory.classList.remove('hidden');
            else btnHistory.classList.add('hidden');
        }
        const btnDaySkill = document.getElementById('btn-day-skill');
        const localPanel = document.getElementById('local-day-skill-panel');
        if (btnDaySkill) {
            if (state.daySkill && !state.actionPanel.show) {
                btnDaySkill.classList.remove('hidden');
                // 動態替換背景圖片：騎士用你上傳的新圖，白狼王用原本的自爆圖
                if (state.myRole === '騎士') {
                    btnDaySkill.style.backgroundImage = "url('./img/btn-knight.webp')"; // 使用你上傳的騎士技能圖
                } else {
                    btnDaySkill.style.backgroundImage = "url('./img/btn-explode.webp')"; // 白狼王沿用原本的自爆圖
                }
            } else {
                btnDaySkill.classList.add('hidden');
                if (localPanel) localPanel.classList.add('hidden'); // 確保切換階段時關閉面板
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

                document.getElementById('my-card-img').src = `./img/${state.myRole.split('-')[0]}.webp`;
                
                document.getElementById('role-desc-title').textContent = displayRoleName;
                document.getElementById('role-desc-content').textContent = def ? def.description : '無技能說明。';
                
                cardContainer.classList.remove('hidden');
            }
        }

        // ===============================================
        // [升級] 動態號碼槽生成系統 (Dynamic Target Slots)
        // ===============================================
        const slotsContainer = document.getElementById('target-slots-container');
        if (slotsContainer) {
            slotsContainer.innerHTML = ''; // 每次渲染前清空
            
            // 只有在行動面板開啟時才顯示槽位
            if (state.actionPanel && state.actionPanel.show) {
                slotsContainer.classList.remove('hidden');

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
                    // 女巫專屬：雙槽 (解藥與毒藥)
                    const victim = state.actionPanel.preSelectedTarget;
                    createSlot(victim, victim ? '解藥 (刀口)' : '解藥 (空)', 'antidote');
                    
                    const poisonTarget = selectedTargets.length > 0 ? selectedTargets[0] : null;
                    createSlot(poisonTarget, poisonTarget ? '毒藥' : '選擇毒藥目標', 'poison');

                } else if (state.actionPanel.type === 'double_select') {
                    // 魔術師專屬：雙槽
                    createSlot(selectedTargets[0] || null, '目標 1', '');
                    createSlot(selectedTargets[1] || null, '目標 2', '');

                } else {
                    // 常規單槽 (預言家、狼人、放逐投票等)
                    const target = selectedTargets.length > 0 ? selectedTargets[0] : null;
                    let alignmentLabel = target ? '目標' : '請選擇';
                    let specialClass = '';
                    
                    if (target) {
                        const tData = state.players.find(p => p.seatNumber === target);
                        if (tData && tData.sideTag) {
                            alignmentLabel = tData.sideTag;
                            if (alignmentLabel === '狼人') specialClass = 'wolf';
                            else if (alignmentLabel === '好人') specialClass = 'good';
                            else if (alignmentLabel === '警長') specialClass = 'sheriff';
                            else if (alignmentLabel === '銀水') specialClass = 'silver';
                        }
                    }
                    createSlot(target, alignmentLabel, specialClass);
                }
            } else {
                // 行動階段結束，徹底隱藏容器
                slotsContainer.classList.add('hidden');
            }
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
            
            const isSelected = selectedTargets.includes(p.seatNumber);
            if (isSelected) seat.classList.add('selected');

            if (state.actionPanel.show && !p.isDead && state.actionPanel.selectableSeats.includes(p.seatNumber)) {
                seat.style.cursor = 'pointer';
                seat.addEventListener('click', () => onSeatSelect(p.seatNumber));
            } else {
                seat.style.pointerEvents = 'none';
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
                else if (p.sideTag === '狼人') colorClass = 'tag-red';
                else if (p.sideTag === '暗戀對象') colorClass = 'tag-pink';

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
                <div class="seat-img-wrapper">
                    <img src="./img/seat_${p.seatNumber}.webp" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:18px; font-weight:bold; color:#333;">${p.seatNumber}</div>
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
                        timerDisplay.textContent = remain + 's';
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
                    state.actionPanel.buttons.forEach(bInfo => {
                        const btn = document.createElement('button');
                        btn.textContent = bInfo.text;
                        
                        if (bInfo.id === 'pass') {
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
                        else {
                            btn.className = 'btn-primary';
                        }

                        if (bInfo.requiresTarget) {
                            // [乾淨擴充] 針對雙選模式，必須選滿2人才能解鎖確認按鈕
                            if (state.actionPanel.type === 'double_select' && selectedTargets.length < 2) {
                                btn.disabled = true;
                            } else if (state.actionPanel.type !== 'double_select' && selectedTargets.length === 0) {
                                btn.disabled = true;
                            }
                        }

                        btn.onclick = () => onActionSubmit(bInfo.id);
                        btnContainer.appendChild(btn);
                    });
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

    renderHostView: function(state, onHostAction) {
        const inGameRoomId = document.getElementById('display-room-id-in-game');
        if (inGameRoomId) inGameRoomId.textContent = document.getElementById('display-room-id').textContent;
        const phaseName = document.getElementById('host-phase-name');
        if (phaseName) phaseName.textContent = state.phase;
        
        document.getElementById('host-status-log').innerHTML = state.systemLog || '等待中...';
        
        const setupPanel = document.getElementById('host-setup-panel');
        const controlPanel = document.getElementById('host-control-panel');
        
        if (state.layout.showSetupPanel) {
            setupPanel.classList.remove('hidden');
            controlPanel.classList.add('hidden');
        } else {
            setupPanel.classList.add('hidden');
            controlPanel.classList.remove('hidden');
            
            const nightPanel = document.getElementById('host-night-panel');
            const forceBtn = document.getElementById('btn-force-next');
            const actionBtn = document.getElementById('btn-host-action');

            if (state.layout.showNightPanel) {
                nightPanel.classList.remove('hidden');
                const listEl = document.getElementById('night-flow-list');
                listEl.innerHTML = '';
                if (state.nightFlow) {
                    state.nightFlow.forEach(step => {
                        const li = document.createElement('li');
                        li.className = 'flow-item';
                        if (step.status === 'completed') li.classList.add('completed');
                        else if (step.status === 'active') li.classList.add('active');
                        
                        li.innerHTML = `<span style="font-weight:bold; color: ${step.status==='active'?'var(--accent-green)':'inherit'}">${step.title}</span><span class="flow-status" style="color: ${step.status==='active'?'var(--accent-green)': (step.status==='completed'?'#888':'#ccc')}">${step.result || '等待中'}</span>`;
                        listEl.appendChild(li);
                    });
                }
                if (state.allowForceNext) {
                    forceBtn.classList.remove('hidden');
                    forceBtn.onclick = () => onHostAction('FORCE_NEXT');
                } else {
                    forceBtn.classList.add('hidden');
                }
            } else {
                nightPanel.classList.add('hidden');
                forceBtn.classList.add('hidden');
            }

            if (state.layout.showDayPanel) {
                actionBtn.classList.remove('hidden');
                actionBtn.textContent = state.dayBtnText;
                actionBtn.disabled = state.dayBtnDisabled;
                actionBtn.onclick = () => onHostAction(state.dayBtnCommand);
            } else {
                actionBtn.classList.add('hidden');
            }

            // [新增] 渲染全知視角紀錄
            const logContent = document.getElementById('host-master-log-content');
            if (logContent) {
                if (state.masterLog && state.masterLog.length > 0) {
                    logContent.innerHTML = state.masterLog.map(log => `<div style="margin-bottom:8px; border-bottom:1px dashed #444; padding-bottom:6px;">${log}</div>`).join('');
                    logContent.scrollTop = logContent.scrollHeight;
                } else {
                    logContent.innerHTML = '<div style="color:#777; text-align:center; margin-top:20px;">遊戲尚未產生紀錄</div>';
                }
            }

            // [重構] 使用與玩家端相同邏輯渲染上帝視角座位表
            const leftSeats = document.getElementById('host-left-seats');
            const rightSeats = document.getElementById('host-right-seats');
            if (leftSeats && rightSeats) {
                leftSeats.innerHTML = '';
                rightSeats.innerHTML = '';

                state.players.forEach(p => {
                    const seat = document.createElement('div');
                    seat.className = 'player-seat';
                    if (p.isDead) {
                        seat.classList.add('dead');
                        const reason = (p.deathReason === 'voted' || p.deathReason === 'explode') ? p.deathReason : 'killed';
                        seat.setAttribute('data-death-reason', reason);
                    }

                    const roleText = p.role || '未分配';
                    const styleStr = UI.getTopTagStyle(roleText);
                    let tagsHtml = `<div class="top-tag" style="${styleStr} font-size:11px;">${roleText}</div>`;
                    if (p.isSheriff) tagsHtml += `<div class="sheriff-diamond"></div>`;

                    seat.innerHTML = `
                        <div class="seat-img-wrapper">
                            <img src="./img/seat_${p.seatNumber}.webp" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:18px; font-weight:bold; color:#333;">${p.seatNumber}</div>
                            ${tagsHtml}
                        </div>
                        <div class="player-name">${p.name || '等待加入'}</div>
                    `;

                    if (p.seatNumber <= 6) leftSeats.appendChild(seat);
                    else rightSeats.appendChild(seat);
                });
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
