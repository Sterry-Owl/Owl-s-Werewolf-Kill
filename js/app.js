// ==========================================
// v3.6 應用程式入口與事件綁定 (App Bootstrapper)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    const selectBoard = document.getElementById('select-board-template');
    const deckPreview = document.getElementById('template-deck-preview');

    // 1. 初始化版型選單
    if (selectBoard && typeof BOARD_TEMPLATES !== 'undefined') {
        BOARD_TEMPLATES.forEach(tpl => {
            const opt = document.createElement('option');
            opt.value = tpl.id;
            opt.textContent = tpl.name;
            selectBoard.appendChild(opt);
        });

        selectBoard.addEventListener('change', (e) => {
            const tpl = BOARD_TEMPLATES.find(t => t.id === e.target.value);
            if (tpl) {
                deckPreview.innerHTML = `<strong>配置內容：</strong><br>${tpl.deck.join('、')}`;
            }
        });
        
        // 觸發預設顯示第一項
        selectBoard.dispatchEvent(new Event('change'));
    }

    // 2. 建立房間 (Host)
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-host').classList.remove('hidden');
        
        if (typeof window.initHost === 'function') window.initHost(roomId);
    });

    // 3. 加入房間 (Player)
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
        const roomId = document.getElementById('input-room-id').value.trim();
        const name = document.getElementById('input-player-name').value.trim();
        
        if (!roomId || !name) return alert('請輸入房間代碼與您的暱稱！');
        
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-player').classList.remove('hidden');
        
        if (typeof window.initPlayer === 'function') window.initPlayer(roomId, name);
    });

    // 4. 確認配置並發牌
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        const selectedId = document.getElementById('select-board-template').value;
        const tpl = BOARD_TEMPLATES.find(t => t.id === selectedId);
        
        if (!tpl) return alert('請選擇版型');

        if (typeof window.startGame === 'function') {
            if (window.startGame(tpl.deck)) {
                // UI 的面板切換現在完全交由 host.js 下發 layout 布林值，不需在此手動 addClass
            }
        }
    });
});