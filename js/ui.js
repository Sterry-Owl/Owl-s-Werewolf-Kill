// ==========================================
// v3.7 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    updateStatusMessage: function(msg) {
        const el = document.getElementById('player-status-message');
        if (el) el.textContent = msg;
    },

    blockActionPanel: function() {
        const panel = document.getElementById('player-action-panel');
        const statusMsg = document.getElementById('player-status-message');
        if(panel) panel.classList.add('hidden');
        if(statusMsg) {
            statusMsg.classList.remove('hidden');
            statusMsg.textContent = '行動已送出，等待系統結算...';
        }
        document.querySelectorAll('.player-seat').forEach(s => {
            s.style.pointerEvents = 'none';
        });
    },

    // ----------------------------------------------------
    // 玩家端 4:5 結構視圖渲染 (Player View)
    // ----------------------------------------------------
    renderPlayerView: function(state, onSeatSelect, onActionSubmit, selectedTargets = []) {
        document.getElementById('player-seat-number').textContent = state.mySeat || '-';
        if (state.myRole) {
            document.getElementById('player-role-name').textContent = state.myRole;
            
            const cardImg = document.getElementById('my-card-img');
            if (cardImg) {
                cardImg.src = `./img/${state.myRole.split('-')[0]}.png`;
                cardImg.classList.remove('hidden');
                cardImg.style.display = 'block';
            }
        }

        // --- 中央目標預覽與查驗結果標籤 ---
        const previewEl = document.getElementById('target-preview-circle');
        const previewImg = document.getElementById('target-preview-img');
        let previewLabel = document.getElementById('target-preview-label');
        
        // 動態建立中央下方標籤
        if (previewEl && !previewLabel) {
            previewLabel = document.createElement('div');
            previewLabel.id = 'target-preview-label';
            previewLabel.style.cssText = "position: absolute; bottom: -15px; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; color: white; white-space: nowrap; z-index: 20;";
            previewEl.style.overflow = 'visible'; 
            if (previewImg) previewImg.style.borderRadius = '50%'; // 避免溢出裁切失效
            previewEl.appendChild(previewLabel);
        }

        let showCenterSeat = null;
        let showCenterAlignment = null;

        // 優先顯示當前選取的目標，若無選取目標，則顯示當晚預言家的最新查驗結果
        if (selectedTargets.length > 0) {
            showCenterSeat = selectedTargets[0];
            const tData = state.players.find(p => p.seatNumber === showCenterSeat);
            if (tData && tData.knownAlignment) showCenterAlignment = tData.knownAlignment;
        } else if (state.latestCheckResult) {
            showCenterSeat = state.latestCheckResult.seat;
            showCenterAlignment = state.latestCheckResult.alignment;
        }

        if (showCenterSeat) {
            if (previewEl) previewEl.classList.remove('hidden');
            if (previewImg) previewImg.src = `./img/seat_${showCenterSeat}.png`;

            if (previewLabel) {
                if (showCenterAlignment) {
                    previewLabel.textContent = showCenterAlignment;
                    previewLabel.style.background = showCenterAlignment === '狼人' ? 'var(--accent-red)' : 'var(--accent-blue)';
                    previewLabel.classList.remove('hidden');
                } else {
                    previewLabel.classList.add('hidden');
                }
            }
        } else {
            if (previewEl) previewEl.classList.add('hidden');
        }

        // --- 左右玩家列表區 ---
        const leftSeats = document.getElementById('left-seats');
        const rightSeats = document.getElementById('right-seats');
        if (!leftSeats || !rightSeats) return;
        leftSeats.innerHTML = '';
        rightSeats.innerHTML = '';

        state.players.forEach((p, i) => {
            const seat = document.createElement('div');
            seat.className = 'player-seat';
            if (p.isDead) seat.classList.add('dead');
            
            const isSelected = selectedTargets.includes(p.seatNumber);
            if (isSelected) seat.classList.add('selected');

            if (state.actionPanel.show && !p.isDead && state.actionPanel.selectableSeats.includes(p.seatNumber)) {
                seat.style.cursor = 'pointer';
                seat.addEventListener('click', () => onSeatSelect(p.seatNumber));
            } else {
                seat.style.pointerEvents = 'none';
            }

            let tagsHtml = '';
            
            // 狼人隊友空刀標籤
            if (p.wolfTags && p.wolfTags.length > 0) {
                p.wolfTags.forEach((tag, idx) => {
                    tagsHtml += `<div class="wolf-tag" style="top: ${-5 - (idx*15)}px; right: -5px;">${tag}</div>`;
                });
                if (!isSelected) seat.classList.add('wolf-selected');
            }

            // 預言家永久查驗陣營標籤 (放置於左下角)
            if (p.knownAlignment) {
                const bgColor = p.knownAlignment === '狼人' ? 'var(--accent-red)' : 'var(--accent-blue)';
                tagsHtml += `<div style="position: absolute; bottom: 15px; left: -15px; background: ${bgColor}; color: white; font-size: 10px; padding: 2px 4px; border-radius: 4px; font-weight: bold; z-index: 15; box-shadow: 0 0 5px rgba(0,0,0,0.5);">${p.knownAlignment}</div>`;
            }

            seat.innerHTML = `
                <div class="role-label ${p.roleInfo ? '' : 'hidden'}" style="top:-15px;">${p.roleInfo || ''}</div>
                <div class="seat-img-wrapper">
                    <img src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
                </div>
                ${tagsHtml}
                <div class="player-name">${p.name || '等待加入'}</div>
            `;

            // [修改] 1~6 號靠左，7~12 號靠右
            if (p.seatNumber <= 6) {
                leftSeats.appendChild(seat);
            } else {
                rightSeats.appendChild(seat);
            }
        });

        // --- 底部操作與訊息區 ---
        const actionPanel = document.getElementById('player-action-panel');
        const statusMsg = document.getElementById('player-status-message');

        if (state.actionPanel.show) {
            if(actionPanel) actionPanel.classList.remove('hidden');
            if(statusMsg) statusMsg.classList.add('hidden'); 
            
            const promptEl = document.getElementById('action-prompt');
            if(promptEl) promptEl.textContent = state.actionPanel.prompt;
            
            const btnContainer = document.getElementById('dynamic-buttons-container');
            if (btnContainer) {
                btnContainer.innerHTML = '';
                if (state.actionPanel.buttons && state.actionPanel.buttons.length > 0) {
                    state.actionPanel.buttons.forEach(bInfo => {
                        const btn = document.createElement('button');
                        btn.textContent = bInfo.text;
                        
                        if (bInfo.id === 'pass') btn.className = 'btn-secondary';
                        else if (bInfo.id === 'poison') btn.style.background = '#800080'; 
                        else btn.className = 'btn-primary';

                        if (bInfo.requiresTarget && selectedTargets.length === 0) {
                            btn.disabled = true;
                        }

                        if (bInfo.id === 'pass' && state.actionPanel.passTags && state.actionPanel.passTags.length > 0) {
                            btn.style.position = 'relative';
                            state.actionPanel.passTags.forEach((tag, idx) => {
                                btn.innerHTML += `<span class="wolf-tag" style="top: -15px; right: ${-10 + (idx*20)}px;">${tag}</span>`;
                            });
                        }

                        btn.onclick = () => onActionSubmit(bInfo.id);
                        btnContainer.appendChild(btn);
                    });
                }
            }
        } else {
            if(actionPanel) actionPanel.classList.add('hidden');
            if(statusMsg) {
                statusMsg.classList.remove('hidden');
                statusMsg.textContent = state.message || '';
            }
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
                <div class="seat-img-wrapper" style="width: 56px; height: 56px; border-radius: 50%; border: 3px solid #555; background: #222; position: relative;">
                    <img src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
                </div>
                <div class="player-name">${p.name || '等待加入'}</div>
            `;
            grid.appendChild(seat);
        });
    }
};