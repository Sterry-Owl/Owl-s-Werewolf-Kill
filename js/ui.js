const UI = {
    renderPlayerGrid: function(containerId, players, isHost = false, onPlayerClick = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        
        const isVoting = containerId === 'voting-targets-grid';

        if (isVoting) {
            container.className = 'players-grid';
            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(80px, 1fr))';
            container.style.gap = '15px';
            container.style.position = '';
            container.style.width = '100%';
            container.style.height = 'auto';
            container.style.border = 'none';
        } else {
            container.className = 'circle-container';
            container.style.position = 'relative';
            const size = containerId.includes('host') ? 400 : 350;
            container.style.width = `${size}px`;
            container.style.height = `${size}px`;
            container.style.margin = '20px auto';
            container.style.borderRadius = '50%';
            container.style.border = '2px dashed #444';
            container.style.display = 'block';
        }

        const radius = containerId.includes('host') ? 160 : 130;
        const center = containerId.includes('host') ? 200 : 175;

        players.forEach((player, i) => {
            const seat = document.createElement('div');
            seat.id = `${containerId}-seat-${player.seatNumber}`;
            seat.dataset.seatNumber = player.seatNumber;

            if (isVoting) {
                seat.className = 'player-seat';
                seat.style.position = 'relative';
                seat.style.margin = '0 auto';
                seat.style.width = '80px';
                seat.style.height = 'auto';
                seat.style.background = '#333';
                seat.style.padding = '10px';
                seat.style.borderRadius = '8px';
                seat.style.border = '2px solid transparent';
            } else {
                seat.className = 'seat player-seat';
                seat.style.position = 'absolute';
                const angle = (i * (2 * Math.PI) / players.length) - (Math.PI / 2);
                const x = center + radius * Math.cos(angle);
                const y = center + radius * Math.sin(angle);
                seat.style.left = `${x}px`;
                seat.style.top = `${y}px`;
                seat.style.transform = 'translate(-50%, -50%)';
                seat.style.margin = '0';
            }

            // 【防破版設計】如果圖片載入失敗，會隱藏 img 並顯示 span 裡的座位大數字
            seat.innerHTML = `
                <div class="role-label hidden"></div>
                <div style="width: 60px; height: 60px; border-radius: 50%; background-color: #222; margin-bottom: 5px; display: flex; justify-content: center; align-items: center; border: 2px solid #555; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.4);">
                    <img class="seat-img" src="./img/${player.seatNumber}.png" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span style="display: none; color: #fff; font-size: 24px; font-weight: bold;">${player.seatNumber}</span>
                </div>
                <div class="player-name" style="margin-top: 5px;">${player.name || '等待加入'}</div>
            `;

            if (player.isDead) seat.classList.add('dead');

            if (isHost) {
                const roleLabel = seat.querySelector('.role-label');
                roleLabel.textContent = player.role || '未分配';
                roleLabel.classList.remove('hidden');
            } else if (onPlayerClick && !player.isDead) {
                seat.addEventListener('click', () => onPlayerClick(player.seatNumber, seat));
            }

            container.appendChild(seat);
        });
    },

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

    hideSpecialOptions: function() {
        const container = document.getElementById('special-options-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
    },

    updateStatusMessage: function(message) {
        const statusEl = document.getElementById('player-status-message');
        if (statusEl) statusEl.textContent = message;
    },

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

    lockPlayerInterface: function() {
        const grid = document.getElementById('player-targets-grid');
        if (grid) grid.classList.add('locked');
        
        const confirmBtn = document.getElementById('btn-confirm-action');
        if (confirmBtn) confirmBtn.disabled = true;
        
        const passBtn = document.getElementById('btn-pass-action');
        if (passBtn) passBtn.classList.add('hidden');
        
        const cancelBtn = document.getElementById('btn-cancel-action');
        if (cancelBtn) cancelBtn.classList.add('hidden');
        
        this.updateStatusMessage('請閉眼或等待他人行動...');
    },

    unlockPlayerInterface: function(promptText) {
        const grid = document.getElementById('player-targets-grid');
        if (grid) grid.classList.remove('locked');
        
        const promptEl = document.getElementById('action-prompt');
        if (promptEl) promptEl.textContent = promptText;
        
        const passBtn = document.getElementById('btn-pass-action');
        if (passBtn) passBtn.classList.remove('hidden');
        
        this.updateStatusMessage('你的回合，請執行行動。');
    },

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