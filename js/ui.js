// ==========================================
// v3.0 視圖渲染引擎 (Pure View)
// ==========================================

const UI = {
    updateStatusMessage: function(msg) {
        const el = document.getElementById('player-status-message');
        if (el) el.textContent = msg;
    },

    renderDeck: function(roleCounts) {
        const container = document.getElementById('player-config-display');
        if (!container) return;
        container.innerHTML = '';
        Object.entries(roleCounts).forEach(([role, count]) => {
            if (count > 0) {
                container.innerHTML += `<div style="display:flex; align-items:center; gap:5px;"><img src="./img/${role}.png" style="width:30px;height:30px;border-radius:4px;" onerror="this.style.display='none'"> <span style="color:#ccc;font-size:14px;">x${count}</span></div>`;
            }
        });
    },

    blockActionPanel: function() {
        const panel = document.getElementById('player-action-panel');
        if(panel) panel.classList.add('hidden');
        this.updateStatusMessage('行動已送出，等待系統結算...');
        document.querySelectorAll('#player-targets-grid .player-seat').forEach(s => {
            s.style.pointerEvents = 'none';
        });
    },

    // ----------------------------------------------------
    // 玩家端視圖渲染 (Player View)
    // ----------------------------------------------------
    renderPlayerView: function(state, onSeatSelect, selectedTargets = []) {
        // 1. 基本資訊更新
        document.getElementById('player-seat-number').textContent = state.mySeat || '-';
        if (state.myRole) {
            document.getElementById('player-role-name').textContent = state.myRole;
            document.getElementById('player-role-display').classList.remove('hidden');
            document.getElementById('my-card-img').src = `./img/${state.myRole}.png`;
            document.getElementById('my-card-img').classList.remove('hidden');
            document.querySelector('#player-center-card h3').textContent = state.myRole;
        }

        this.updateStatusMessage(state.message || '');

        // 2. 圓桌渲染
        const grid = document.getElementById('player-targets-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const radius = 190;
        const center = 225;

        state.players.forEach((p, i) => {
            const seat = document.createElement('div');
            seat.className = 'seat player-seat';
            if (p.isDead) seat.classList.add('dead');
            
            const isSelected = selectedTargets.includes(p.seatNumber);
            if (isSelected) seat.classList.add('selected');

            // 判斷是否可點擊
            if (state.actionPanel.show && !p.isDead && state.actionPanel.selectableSeats.includes(p.seatNumber)) {
                seat.style.cursor = 'pointer';
                seat.addEventListener('click', () => onSeatSelect(p.seatNumber));
            } else {
                seat.style.pointerEvents = 'none';
            }

            // 計算圓周座標
            const angle = (i * (2 * Math.PI) / state.players.length) - (Math.PI / 2);
            seat.style.position = 'absolute';
            seat.style.left = `${center + radius * Math.cos(angle)}px`;
            seat.style.top = `${center + radius * Math.sin(angle)}px`;
            seat.style.transform = 'translate(-50%, -50%)';
            seat.style.zIndex = '15';

            // 處理黃色遮罩與狼人預覽標籤 (由主機傳來的 p.wolfTags 決定)
            let wolfTagsHtml = '';
            if (p.wolfTags && p.wolfTags.length > 0) {
                p.wolfTags.forEach((tag, idx) => {
                    wolfTagsHtml += `<div class="wolf-tag" style="top: ${10 + (idx*15)}px; right: -40px;">${tag}</div>`;
                });
                if (!isSelected) seat.classList.add('wolf-selected');
            }

            seat.innerHTML = `
                <div class="role-label ${p.roleInfo ? '' : 'hidden'}">${p.roleInfo || ''}</div>
                <div class="seat-img-wrapper">
                    <img class="seat-img" src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span style="display: none; color: #fff; font-size: 24px; font-weight: bold;">${p.seatNumber}</span>
                </div>
                ${wolfTagsHtml}
                <div class="player-name">${p.name || '等待加入'}</div>
            `;
            grid.appendChild(seat);
        });

        // 3. 行動面板渲染
        const actionPanel = document.getElementById('player-action-panel');
        if (state.actionPanel.show) {
            actionPanel.classList.remove('hidden');
            document.getElementById('action-prompt').textContent = state.actionPanel.prompt;
            
            const btnConfirm = document.getElementById('btn-confirm-action');
            btnConfirm.disabled = selectedTargets.length === 0; // 沒選人不能按確認

            const btnPass = document.getElementById('btn-pass-action');
            if (state.actionPanel.allowPass) {
                btnPass.classList.remove('hidden');
                btnPass.innerHTML = '跳過';
                btnPass.style.position = 'relative';
                
                // 處理空刀的黃色標籤
                if (state.actionPanel.passTags && state.actionPanel.passTags.length > 0) {
                    state.actionPanel.passTags.forEach((tag, idx) => {
                        btnPass.innerHTML += `<span class="wolf-tag" style="top: ${-10 - (idx*15)}px; right: -10px;">${tag}</span>`;
                    });
                }
            } else {
                btnPass.classList.add('hidden');
            }
        } else {
            actionPanel.classList.add('hidden');
        }
    },

    // ----------------------------------------------------
    // 主持人端視圖渲染 (Host View)
    // ----------------------------------------------------
    renderHostView: function(state, onHostAction) {
        document.getElementById('host-status-log').innerHTML = state.systemLog || '等待中...';
        
        const setupPanel = document.getElementById('host-setup-panel');
        const controlPanel = document.getElementById('host-control-panel');
        const dayPanel = document.getElementById('host-day-panel');
        const nightPanel = document.getElementById('host-night-panel');
        
        if (state.phase === 'LOBBY') {
            setupPanel.classList.remove('hidden');
            controlPanel.classList.add('hidden');
        } else {
            setupPanel.classList.add('hidden');
            controlPanel.classList.remove('hidden');
            
            if (state.phase.includes('NIGHT')) {
                dayPanel.classList.add('hidden');
                nightPanel.classList.remove('hidden');
                
                // 渲染夜間流程圖
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
                if(state.allowForceNext) {
                    forceBtn.classList.remove('hidden');
                    forceBtn.onclick = () => onHostAction('FORCE_NEXT');
                } else {
                    forceBtn.classList.add('hidden');
                }
            } else {
                nightPanel.classList.add('hidden');
                dayPanel.classList.remove('hidden');
                
                const actionBtn = document.getElementById('btn-host-action');
                actionBtn.textContent = state.dayBtnText;
                actionBtn.disabled = state.dayBtnDisabled;
                actionBtn.onclick = () => onHostAction(state.dayBtnCommand);
            }
        }

        // 渲染主持人圓桌總覽
        const grid = document.getElementById('host-players-grid');
        grid.innerHTML = '';
        const radius = 160;
        const center = 200;
        
        state.players.forEach((p, i) => {
            const seat = document.createElement('div');
            seat.className = 'seat player-seat';
            if (p.isDead) seat.classList.add('dead');
            
            const angle = (i * (2 * Math.PI) / state.players.length) - (Math.PI / 2);
            seat.style.position = 'absolute';
            seat.style.left = `${center + radius * Math.cos(angle)}px`;
            seat.style.top = `${center + radius * Math.sin(angle)}px`;
            seat.style.transform = 'translate(-50%, -50%)';
            seat.style.zIndex = '15';
            
            seat.innerHTML = `
                <div class="role-label" style="background:var(--accent-blue)">${p.role || '未分配'}</div>
                <div class="seat-img-wrapper" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid #555; background: #222; overflow: hidden; position: relative;">
                    <img class="seat-img" src="./img/seat_${p.seatNumber}.png" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span style="display: none; color: #fff; font-size: 24px; font-weight: bold;">${p.seatNumber}</span>
                </div>
                <div class="player-name">${p.name || '等待加入'}</div>
            `;
            grid.appendChild(seat);
        });
    }
};