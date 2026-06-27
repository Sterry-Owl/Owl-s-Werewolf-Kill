// ==========================================
// v3.8.0 應用程式入口與事件綁定 (App Bootstrapper)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    const selectBoard = document.getElementById('select-board-template');
    const deckPreview = document.getElementById('template-deck-preview');

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
        
        selectBoard.dispatchEvent(new Event('change'));
    }

    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-host').classList.remove('hidden');
        
        if (typeof window.initHost === 'function') window.initHost(roomId);
    });

    document.getElementById('btn-join-room')?.addEventListener('click', () => {
        const roomId = document.getElementById('input-room-id').value.trim();
        const name = document.getElementById('input-player-name').value.trim();
        
        if (!roomId || !name) return alert('請輸入房間代碼與您的暱稱！');
        
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-player').classList.remove('hidden');
        
        if (typeof window.initPlayer === 'function') window.initPlayer(roomId, name);
    });

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        const selectedId = document.getElementById('select-board-template').value;
        const tpl = BOARD_TEMPLATES.find(t => t.id === selectedId);
        
        if (!tpl) return alert('請選擇版型');

        // [新增] 收集主控台的規則設定，包含警長機制
        const gameRules = {
            witchSave: document.getElementById('rule-witch-save')?.value || 'first_night',
            winCondition: document.getElementById('rule-win-condition')?.value || 'kill_side',
            tieResolution: document.getElementById('rule-tie-resolution')?.value || 'pk',
            sheriff: document.getElementById('rule-sheriff')?.value || 'enabled' 
        };

        if (typeof window.startGame === 'function') {
            window.startGame(tpl.deck, tpl.name, gameRules);
        }
    });
});