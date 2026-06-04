// js/ui.js (1/2)

const UI = {
    // 渲染座位網格 (主持人與玩家共用邏輯)
    renderPlayerGrid: function(containerId, players, isHost = false, onPlayerClick = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        players.forEach(player => {
            const seat = document.createElement('div');
            seat.className = 'player-seat';
            seat.id = `${containerId}-seat-${player.seatNumber}`;
            seat.dataset.seatNumber = player.seatNumber;

            const numberSpan = document.createElement('span');
            numberSpan.className = 'seat-number';
            numberSpan.textContent = player.seatNumber;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'seat-name';
            nameSpan.textContent = player.name || '等待加入';

            seat.appendChild(numberSpan);
            seat.appendChild(nameSpan);

            // 狀態外觀判定
            if (player.isDead) {
                seat.classList.add('dead');
            }

            if (isHost) {
                // 主持人視角額外顯示身分
                const roleSpan = document.createElement('span');
                roleSpan.className = 'seat-name';
                roleSpan.style.color = '#e94560';
                roleSpan.textContent = player.role || '未分配';
                seat.appendChild(roleSpan);
            } else if (onPlayerClick && !player.isDead) {
                // 玩家視角綁定點擊事件
                seat.addEventListener('click', () => onPlayerClick(player.seatNumber, seat));
            }

            container.appendChild(seat);
        });
    },

    // 渲染特殊複合選項 (適用於奇蹟商人選技能、盜賊選底牌)
    renderSpecialOptions: function(options, onOptionSelect) {
        const container = document.getElementById('special-options-container');
        if (!container) return;
        container.innerHTML = '';
        container.classList.remove('hidden');

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'special-btn';
            btn.textContent = opt.label;
            btn.dataset.value = opt.value;

            // 處理強制鎖定邏輯 (如盜賊底牌含狼人時)
            if (opt.disabled) {
                btn.classList.add('disabled');
            } else {
                btn.addEventListener('click', () => {
                    Array.from(container.children).forEach(c => c.classList.remove('selected'));
                    btn.classList.add('selected');
                    onOptionSelect(opt.value);
                });
            }

            container.appendChild(btn);
        });
    },

    // 隱藏特殊複合選項
    hideSpecialOptions: function() {
        const container = document.getElementById('special-options-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
    },

    // 更新玩家狀態列訊息
    updateStatusMessage: function(message) {
        const statusEl = document.getElementById('player-status-message');
        if (statusEl) statusEl.textContent = message;
    }
};
// js/ui.js (2/2)

    // ==========================================
    // 主持人端：夜晚流程圖渲染與狀態更新
    // ==========================================
    renderNightFlow: function(flowSequence, currentWakeOrder) {
        const listEl = document.getElementById('night-flow-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        flowSequence.forEach(role => {
            const li = document.createElement('li');
            li.className = 'flow-item';
            li.id = `flow-item-${role.order}`;
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${role.order}. ${role.name}`;
            
            const statusSpan = document.createElement('span');
            statusSpan.className = 'flow-status';
            statusSpan.textContent = '等待中';

            // 狀態判定
            if (currentWakeOrder > role.order) {
                li.classList.add('completed');
                statusSpan.textContent = '已完成';
            } else if (currentWakeOrder === role.order) {
                li.classList.add('active');
                statusSpan.textContent = '行動中...';
            }

            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            listEl.appendChild(li);
        });
    },

    updateNightFlowStatus: function(order, status) {
        const li = document.getElementById(`flow-item-${order}`);
        if (li) {
            const statusSpan = li.querySelector('.flow-status');
            if (statusSpan) statusSpan.textContent = status;
        }
    },

    // ==========================================
    // 玩家端：介面鎖定與解鎖控制
    // ==========================================
    lockPlayerInterface: function() {
        const grid = document.getElementById('player-targets-grid');
        if (grid) grid.classList.add('locked');
        
        const confirmBtn = document.getElementById('btn-confirm-action');
        if (confirmBtn) confirmBtn.disabled = true;
        
        const cancelBtn = document.getElementById('btn-cancel-action');
        if (cancelBtn) cancelBtn.classList.add('hidden');
        
        this.updateStatusMessage('請閉眼或等待他人行動...');
    },

    unlockPlayerInterface: function(promptText) {
        const grid = document.getElementById('player-targets-grid');
        if (grid) grid.classList.remove('locked');
        
        const promptEl = document.getElementById('action-prompt');
        if (promptEl) promptEl.textContent = promptText;
        
        this.updateStatusMessage('你的回合，請執行行動。');
    },

    // ==========================================
    // 玩家端：白天暗投面板控制
    // ==========================================
    showVotingPanel: function(alivePlayers, onVoteSelect) {
        const panel = document.getElementById('player-voting-panel');
        const actionPanel = document.getElementById('player-action-panel');
        if (panel) panel.classList.remove('hidden');
        if (actionPanel) actionPanel.classList.add('hidden');

        this.renderPlayerGrid('voting-targets-grid', alivePlayers, false, (seatNumber, seatEl) => {
            const allSeats = panel.querySelectorAll('.player-seat');
            allSeats.forEach(s => s.classList.remove('selected'));
            
            seatEl.classList.add('selected');
            onVoteSelect(seatNumber);
        });
    },

    hideVotingPanel: function() {
        const panel = document.getElementById('player-voting-panel');
        if (panel) panel.classList.add('hidden');
    }
};