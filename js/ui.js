// ==========================================
// v3.6.12 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    updateStatusMessage: function(msg) {
        const el = document.getElementById('action-prompt');
        if (el) el.textContent = msg;
    },

    blockActionPanel: function() {
        const btnContainer = document.getElementById('dynamic-buttons-container');
        if(btnContainer) btnContainer.innerHTML = '';
        const promptEl = document.getElementById('action-prompt');
        if(promptEl) promptEl.textContent = '行動已送出，等待系統結算...';
        
        document.querySelectorAll('.player-seat').forEach(s => {
            s.style.pointerEvents = 'none';
        });
    },

    // ----------------------------------------------------
    // 玩家端 4:5 結構視圖渲染 (Player View)
    // ----------------------------------------------------
    renderPlayerView: function(state, onSeatSelect, onActionSubmit, selectedTargets = [], showVoteHistory = false) {
        document.getElementById('player-seat-number').textContent = state.mySeat || '-';
        if (state.myRole) {
            document.getElementById('player-role-name').textContent = state.myRole;
        }

        const btnExplode = document.getElementById('btn-self-explode');
        if (btnExplode) {
            if (state.allowSelfExplode) btnExplode.classList.remove('hidden');
            else btnExplode.classList.add('hidden');
        }

        const btnHistory = document.getElementById('btn-vote-history');
        if (btnHistory) {
            if (state.voteHistory && state.voteHistory.length > 0) btnHistory.classList.remove('hidden');
            else btnHistory.classList.add('hidden');
        }

        const cardImg = document.getElementById('my-card-img');
        const historyPanel = document.getElementById('vote-history-panel');

        if (showVoteHistory) {
            if (cardImg) cardImg.classList.add('hidden');
            if (historyPanel) {
                historyPanel.classList.remove('hidden');
                historyPanel.innerHTML = state.voteHistory.map(h => `<div style="margin-bottom:8px; border-bottom:1px solid #444; padding-bottom:5px; white-space:pre-wrap;">${h}</div>`).join('');
            }
        } else {
            if (historyPanel) historyPanel.classList.add('hidden');
            if (cardImg && state.myRole) {
                cardImg.src = `./img/${state.myRole.split('-')[0]}.png`;
                cardImg.classList.remove('hidden');
                cardImg.style.display = 'block';
            }
        }

        const previewEl = document.getElementById('target-preview-circle');
        const previewImg = document.getElementById('target-preview-img');
        let previewLabel = document.getElementById('target-preview-label');

        let showCenterSeat = null;
        let showCenterAlignment = null;

        if (selectedTargets.length > 0) {
            showCenterSeat = selectedTargets[0];
            const tData = state.players.find(p => p.seatNumber === showCenterSeat);
            if (tData && tData.sideTag) showCenterAlignment = tData.sideTag; // [改動] 對接 sideTag
        } else if (state.actionPanel && state.actionPanel.preSelectedTarget) {
            showCenterSeat = state.actionPanel.preSelectedTarget;
            showCenterAlignment = "刀口";
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
                    if (showCenterAlignment === '狼人' || showCenterAlignment === '刀口') {
                        previewLabel.style.background = 'var(--accent-red)';
                    } else {
                        previewLabel.style.background = 'var(--accent-blue)';
                    }
                    previewLabel.classList.remove('hidden');
                } else {
                    previewLabel.classList.add('hidden');
                }
            }
        } else {
            if (previewEl) previewEl.classList.add('hidden');
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
            
            const isSelected = selectedTargets.includes(p.seatNumber);
            if (isSelected) seat.classList.add('selected');

            if (state.actionPanel.show && !p.isDead && state.actionPanel.selectableSeats.includes(p.seatNumber)) {
                seat.style.cursor = 'pointer';
                seat.addEventListener('click', () => onSeatSelect(p.seatNumber));
            } else {
                seat.style.pointerEvents = 'none';
            }

            let tagsHtml = '';
            
            if (p.topTag) {
                tagsHtml += `<div class="top-tag">${p.topTag}</div>`;
            }
            
            // [新增] 判斷座位隸屬左右側，動態指派 side-tag 方向
            if (p.sideTag) {
                const isLeftColumn = p.seatNumber <= Math.ceil(state.players.length / 2);
                const alignClass = isLeftColumn ? 'align-right' : 'align-left';
                tagsHtml += `<div class="side-tag ${alignClass}">${p.sideTag}</div>`;
            }

            seat.innerHTML = `
                <div class="seat-img-wrapper">
                    <img src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:18px; font-weight:bold; color:#333;">${p.seatNumber}</div>
                    ${tagsHtml}
                </div>
                <div class="player-name">${p.name || '等待加入'}</div>
            `;

            if (p.seatNumber <= Math.ceil(state.players.length / 2)) {
                leftSeats.appendChild(seat);
            } else {
                rightSeats.appendChild(seat);
            }
        });

        const promptEl = document.getElementById('action-prompt');
        const btnContainer = document.getElementById('dynamic-buttons-container');
        
        if (state.actionPanel.show) {
            if(promptEl) promptEl.textContent = state.actionPanel.prompt;
            
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

                        btn.onclick = () => onActionSubmit(bInfo.id);
                        btnContainer.appendChild(btn);
                    });
                }
            }
        } else {
            if(promptEl) promptEl.textContent = state.message || '等待系統指示...';
            if(btnContainer) btnContainer.innerHTML = '';
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
            
            // [修改] 補上 overflow: hidden 強制裁切主控台頭像邊緣
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