// ==========================================
// v3.8.0 應用程式入口與事件綁定 (App Bootstrapper)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    const boardContainer = document.getElementById('board-template-container');
    const hiddenSelectBoard = document.getElementById('select-board-template');
    const deckPreview = document.getElementById('template-deck-preview');
    const categoryTabs = document.querySelectorAll('#template-category-tabs .toggle-option');

    if (boardContainer && hiddenSelectBoard && typeof BOARD_TEMPLATES !== 'undefined') {
        
        // [乾淨架構] 抽離渲染函數，根據傳入的 category 過濾版型
        const renderTemplatesByCategory = (category) => {
            boardContainer.innerHTML = ''; 
            const filteredTemplates = BOARD_TEMPLATES.filter(t => t.category === category || !t.category);
            
            if (filteredTemplates.length === 0) {
                boardContainer.innerHTML = '<div style="color:#777; font-size:14px; padding:10px;">此分類尚無版型</div>';
                return;
            }

            filteredTemplates.forEach((tpl, index) => {
                const btn = document.createElement('button');
                btn.className = 'template-btn';
                if (index === 0) btn.classList.add('active'); // 預設選中該分類的第一個
                btn.textContent = tpl.name;
                
                btn.addEventListener('click', () => {
                    boardContainer.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    hiddenSelectBoard.value = tpl.id;
                    deckPreview.innerHTML = `<strong>配置內容：</strong><br>${tpl.deck.join('、')}`;
                });
                boardContainer.appendChild(btn);
            });
            
            // 切換分類時，強制作業系統選中該分類的第一個版型 (防止資料不同步 Bug)
            hiddenSelectBoard.value = filteredTemplates[0].id;
            deckPreview.innerHTML = `<strong>配置內容：</strong><br>${filteredTemplates[0].deck.join('、')}`;
        };

        // 綁定標籤切換事件
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderTemplatesByCategory(tab.getAttribute('data-category'));
            });
        });

        // 初始化：預設渲染「快速場 (quick)」
        renderTemplatesByCategory('quick');
    }

    // === 升級後：規則滑動開關邏輯 ===
    document.querySelectorAll('.toggle-group').forEach(group => {
        const targetId = group.getAttribute('data-target');
        const hiddenInput = document.getElementById(targetId);
        const options = group.querySelectorAll('.toggle-option');

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                // 切換 active 樣式
                options.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                // 將選中的 data-value 寫入對應的隱藏輸入框
                if (hiddenInput) {
                    hiddenInput.value = opt.getAttribute('data-value');
                }
            });
        });
    });

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
