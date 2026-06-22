// ==========================================
// v3.0 應用程式入口與事件綁定 (App Bootstrapper)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. 建立房間 (Host 登入)
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-host').classList.remove('hidden');
        
        // 啟動主機引擎
        if (typeof window.initHost === 'function') window.initHost(roomId);
        
        // 渲染選角面板 (依據 config.js 的 BASE_ROLES)
        renderHostSetupGrid(); 
    });

    // 2. 加入房間 (Player 登入)
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
        const roomId = document.getElementById('input-room-id').value.trim();
        const name = document.getElementById('input-player-name').value.trim();
        
        if (!roomId || !name) return alert('請輸入房間代碼與您的暱稱！');
        
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-player').classList.remove('hidden');
        
        // 啟動玩家終端引擎
        if (typeof window.initPlayer === 'function') window.initPlayer(roomId, name);
    });

    // 3. 渲染主機的「牌堆配置面板」
    function renderHostSetupGrid() {
        const setupGrid = document.getElementById('role-selection-grid');
        if (!setupGrid) return;
        setupGrid.innerHTML = '';
        
        BASE_ROLES.forEach(roleName => {
            const card = document.createElement('div');
            card.className = 'config-card';
            card.innerHTML = `
                <img src="./img/${roleName}.png" style="width: 60px; height: 60px; object-fit: contain; margin-bottom: 5px; background: #222; border-radius: 6px;" onerror="this.style.display='none'">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${roleName}</div>
                <div style="display: flex; justify-content: center; align-items: center; gap: 8px;">
                    <button type="button" class="btn-minus" data-role="${roleName}" style="padding: 2px 10px; background: #555; color: white; border: none; border-radius: 4px;">-</button>
                    <span class="role-qty-display" id="qty-${roleName}" data-val="0" style="font-size: 16px; font-weight: bold; width: 20px;">0</span>
                    <button type="button" class="btn-plus" data-role="${roleName}" style="padding: 2px 10px; background: var(--accent-blue); color: white; border: none; border-radius: 4px;">+</button>
                </div>
            `;
            setupGrid.appendChild(card);
        });
    }

    // 4. 監聽配置面板的「加減號」並實時廣播
    document.getElementById('role-selection-grid')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-minus') || e.target.classList.contains('btn-plus')) {
            const role = e.target.dataset.role;
            const span = document.getElementById(`qty-${role}`);
            let val = parseInt(span.dataset.val) || 0;
            
            if (e.target.classList.contains('btn-minus') && val > 0) val--;
            if (e.target.classList.contains('btn-plus')) val++;
            
            span.dataset.val = val;
            span.textContent = val;
            
            updateDeckAndSync();
        }
    });

    function updateDeckAndSync() {
        let count = 0;
        let currentDeck = [];
        document.querySelectorAll('.role-qty-display').forEach(span => {
            let val = parseInt(span.dataset.val) || 0;
            count += val;
            let roleName = span.id.replace('qty-', '');
            for (let i = 0; i < val; i++) currentDeck.push(roleName);
        });
        
        const display = document.getElementById('deck-count-display');
        if (display) display.textContent = count;
        
        // 呼叫 host.js 的函式，將目前牌堆廣播給所有已加入的玩家
        if (typeof window.syncDeckToPlayers === 'function') {
            window.syncDeckToPlayers(currentDeck);
        }
    }

    // 5. 點擊「確認配置並發牌」
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        let deck = [];
        document.querySelectorAll('.role-qty-display').forEach(span => {
            let val = parseInt(span.dataset.val) || 0;
            let roleName = span.id.replace('qty-', '');
            for (let i = 0; i < val; i++) deck.push(roleName);
        });
        
        if (deck.length === 0) return alert('請至少選擇一名角色！');
        
        if (typeof window.startGame === 'function') {
            // startGame 會驗證人數，如果回傳 true 代表發牌成功
            if (window.startGame(deck)) {
                document.getElementById('host-setup-panel').classList.add('hidden');
                document.getElementById('host-control-panel').classList.remove('hidden');
            }
        }
    });
});