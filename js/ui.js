// ==========================================
// v3.8.0 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    countdownInterval: null, 

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
                parent.innerHTML = ''; // 清空原本的 "身分：XXX"
                
                // 建立按鈕
                detailsBtn = document.createElement('span');
                detailsBtn.id = 'btn-board-details';
                detailsBtn.className = 'btn-board-details';
                detailsBtn.textContent = '版型詳情 ℹ️';
                parent.appendChild(detailsBtn);

                // 建立面板
                detailsPanel = document.createElement('div');
                detailsPanel.id = 'board-details-panel';
                detailsPanel.className = 'board-details-panel';
                document.body.appendChild(detailsPanel);

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
        if (detailsPanel && state.boardDetails) {
            const rules = state.boardDetails.rules;
            const wMap = { 'first_night': '僅首夜可自救', 'never': '全程不可自救', 'always': '全程可自救' };
            const winMap = { 'kill_side': '屠邊', 'kill_all': '屠城' };
            const tieMap = { 'pk': 'PK發言', 'vote': '直接出局' };
            const sMap = { 'enabled': '開啟', 'disabled': '關閉' };
            
            const ruleStr = Object.keys(rules).length > 0 
                ? `女巫解藥：${wMap[rules.witchSave] || rules.witchSave}\n平票處理：${tieMap[rules.tieResolution] || rules.tieResolution}\n警長機制：${sMap[rules.sheriff] || rules.sheriff}\n勝利條件：${winMap[rules.winCondition] || rules.winCondition}`
                : `設定載入中...`;

            detailsPanel.textContent = `【版型配置】\n${state.boardDetails.deckString}\n\n【房間規則】\n${ruleStr}`;
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
                    btnDaySkill.style.backgroundImage = "url('./img/btn-knight.png')"; // 使用你上傳的騎士技能圖
                } else {
                    btnDaySkill.style.backgroundImage = "url('./img/btn-explode.png')"; // 白狼王沿用原本的自爆圖
                }
            } else {
                btnDaySkill.classList.add('hidden');
                if (localPanel) localPanel.classList.add('hidden'); // 確保切換階段時關閉面板
            }
        }
        const cardPanel = document.querySelector('.card-panel');
        const cardImg = document.getElementById('my-card-img');
        const historyPanel = document.getElementById('vote-history-panel');

        if (showVoteHistory) {
            if (cardPanel) cardPanel.style.zIndex = '25'; 
            if (cardImg) cardImg.classList.add('hidden');
            if (historyPanel) {
                historyPanel.classList.remove('hidden');
                historyPanel.innerHTML = state.voteHistory.map(h => `<div style="margin-bottom:8px; border-bottom:1px solid #444; padding-bottom:5px; white-space:pre-wrap;">${h}</div>`).join('');
            }
        } else {
            if (cardPanel) cardPanel.style.zIndex = '15'; 
            if (historyPanel) historyPanel.classList.add('hidden');
            if (cardImg && state.myRole) {
                cardImg.src = `./img/${state.myRole.split('-')[0]}.png`;
                cardImg.classList.remove('hidden');
                cardImg.style.display = 'block';
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
                        img.src = `./img/seat_${seatNum}.png`;
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

                if (state.myRole === '女巫') {
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
            if (p.isDead) seat.classList.add('dead');
            
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
            
            // [新增] 繪製警長競選狀態圓圈 (參選/退水) 或 PK 紅色圓點
            // 注意：因為它們都在右下角，我們讓 PK 圓點優先級更高（會蓋過退水標記）
            if (p.isPKTarget) {
                tagsHtml += `<div class="pk-dot"></div>`;
            } else if (p.isCandidate) {
                tagsHtml += `<div class="candidate-dot"></div>`;
            } else if (p.hasWithdrawn) {
                tagsHtml += `<div class="candidate-dot withdrawn"></div>`;
            }

            if (p.topTag) {
                tagsHtml += `<div class="top-tag">${p.topTag}</div>`;
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
                    <img src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
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
        document.getElementById('host-status-log').innerHTML = state.systemLog || '等待中...';
        
        const setupPanel = document.getElementById('host-setup-panel');
        const controlPanel = document.getElementById('host-control-panel');
        const dayPanel = document.getElementById('host-day-panel');
        const nightPanel = document.getElementById('host-night-panel');
        
        if (state.layout.showSetupPanel) {
            setupPanel.classList.remove('hidden');
            controlPanel.classList.add('hidden');
        } else {
            setupPanel.classList.add('hidden');
            controlPanel.classList.remove('hidden');
            
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
                        
                        li.innerHTML = `
                            <span style="font-weight:bold; color: ${step.status==='active'?'var(--accent-green)':'inherit'}">${step.title}</span>
                            <span class="flow-status" style="color: ${step.status==='active'?'var(--accent-green)': (step.status==='completed'?'#888':'#ccc')}">${step.result || '等待中'}</span>
                        `;
                        listEl.appendChild(li);
                    });
                }
                
                const forceBtn = document.getElementById('btn-force-next');
                if (state.allowForceNext) {
                    forceBtn.classList.remove('hidden');
                    forceBtn.onclick = () => onHostAction('FORCE_NEXT');
                } else {
                    forceBtn.classList.add('hidden');
                }
            } else {
                nightPanel.classList.add('hidden');
            }

            if (state.layout.showDayPanel) {
                dayPanel.classList.remove('hidden');
                const actionBtn = document.getElementById('btn-host-action');
                actionBtn.textContent = state.dayBtnText;
                actionBtn.disabled = state.dayBtnDisabled;
                actionBtn.onclick = () => onHostAction(state.dayBtnCommand);
            } else {
                dayPanel.classList.add('hidden');
            }
        }

        const grid = document.getElementById('host-players-grid');
        grid.innerHTML = '';
        state.players.forEach(p => {
            const seat = document.createElement('div');
            seat.className = 'player-seat';
            if (p.isDead) seat.classList.add('dead');
            
            seat.innerHTML = `
                <div class="role-label" style="background:var(--accent-blue)">${p.role || '未分配'}</div>
                <div class="seat-img-wrapper" style="width: 56px; height: 56px; border-radius: 50%; border: 3px solid #555; background: #222; position: relative; overflow: hidden;">
                    <img src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
                </div>
                <div class="player-name">${p.name || '等待加入'}</div>
            `;
            grid.appendChild(seat);
        });
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
