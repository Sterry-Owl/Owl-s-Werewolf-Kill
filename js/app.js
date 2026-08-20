// ==========================================
// v3.8.0 應用程式入口與事件綁定 (App Bootstrapper)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    const boardContainer = document.getElementById('board-template-container');
    const hiddenSelectBoard = document.getElementById('select-board-template');
    const deckPreview = document.getElementById('template-deck-preview');
    const categoryTabs = document.querySelectorAll('#template-category-tabs .toggle-option');

    if (boardContainer && hiddenSelectBoard && typeof BOARD_TEMPLATES !== 'undefined') {
        let currentCategoryTemplates = [];
        let currentBoardPage = 0;
        const BOARDS_PER_PAGE = 12;
        const updateRolePreview = (deck) => {
            const previewEl = document.getElementById('board-role-preview');
            if (!previewEl) return;
            
            const wolves = [];
            const gods = [];
            const others = []; // 平民與第三方

            deck.forEach(role => {
                let color = '#ccc';
                let targetGroup = others;

                if (typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[role]) {
                    const def = ROLE_DICTIONARY[role];
                    if (def.faction === 'wolf') {
                        color = '#9e646a'; // 低飽和紅
                        targetGroup = wolves;
                    } else if (def.type === 'god') {
                        color = '#c4a75c'; // 低飽和黃
                        targetGroup = gods;
                    } else if (def.type === 'villager') {
                        color = '#6a8c6e'; // 低飽和綠
                        targetGroup = others;
                    } else if (def.faction === 'third_party') {
                        color = '#8a7096'; // 低飽和紫
                        targetGroup = others;
                    }
                }
                
                targetGroup.push(`<span style="color:${color}; font-weight:bold;">${role}</span>`);
            });
            const renderLine = (arr) => arr.length > 0 ? `<div style="white-space:nowrap; margin-bottom:1px;">${arr.join('<span style="color:#555; margin:0 2px;">、</span>')}</div>` : '';
            previewEl.style.height = '42px';
            
            previewEl.innerHTML = `
                <div class="role-preview-inner" style="display:flex; flex-direction:column; align-items:flex-start; width:fit-content; margin:0 auto; line-height:1.4;">
                    ${renderLine(wolves)}
                    ${renderLine(gods)}
                    ${renderLine(others)}
                </div>
            `;
        };

        const renderBoardPage = () => {
            boardContainer.innerHTML = '';
            const start = currentBoardPage * BOARDS_PER_PAGE;
            const end = start + BOARDS_PER_PAGE;
            const pageItems = currentCategoryTemplates.slice(start, end);

            if (currentCategoryTemplates.length === 0) {
                boardContainer.innerHTML = '<div style="color:#777; font-size:14px; padding:10px; grid-column: span 4; text-align: center;">此分類尚無版型</div>';
                document.getElementById('board-pagination-controls').style.visibility = 'hidden';
                document.getElementById('board-role-preview').innerHTML = ''; 
                return;
            }

            pageItems.forEach((tpl) => {
                const item = document.createElement('div');
                item.className = 'board-btn'; 
                if (hiddenSelectBoard.value === tpl.id) {
                    item.classList.add('active');
                    updateRolePreview(tpl.deck);
                }
                item.textContent = tpl.name;
                
                item.addEventListener('click', () => {
                    boardContainer.querySelectorAll('.board-btn').forEach(b => b.classList.remove('active'));
                    item.classList.add('active');
                    hiddenSelectBoard.value = tpl.id;
                    updateRolePreview(tpl.deck);
                });
                boardContainer.appendChild(item);
            });

            const totalPages = Math.ceil(currentCategoryTemplates.length / BOARDS_PER_PAGE);
            const indicator = document.getElementById('board-page-indicator');
            const btnPrev = document.getElementById('btn-prev-page');
            const btnNext = document.getElementById('btn-next-page');

            if (indicator) indicator.textContent = `${currentBoardPage + 1} / ${totalPages}`;
            if (btnPrev) btnPrev.disabled = currentBoardPage === 0;
            if (btnNext) btnNext.disabled = currentBoardPage >= totalPages - 1;

            const paginationCtrl = document.getElementById('board-pagination-controls');
            if (paginationCtrl) paginationCtrl.style.visibility = totalPages > 1 ? 'visible' : 'hidden';
        };

        const renderTemplatesByCategory = (category) => {
            currentCategoryTemplates = BOARD_TEMPLATES.filter(t => t.category === category || !t.category);
            currentBoardPage = 0;
            
            if (currentCategoryTemplates.length > 0) {
                hiddenSelectBoard.value = currentCategoryTemplates[0].id;
            }
            renderBoardPage();
        };
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderTemplatesByCategory(tab.getAttribute('data-category'));
            });
        });
        document.getElementById('btn-prev-page')?.addEventListener('click', () => {
            if (currentBoardPage > 0) {
                currentBoardPage--;
                renderBoardPage();
            }
        });

        document.getElementById('btn-next-page')?.addEventListener('click', () => {
            const totalPages = Math.ceil(currentCategoryTemplates.length / BOARDS_PER_PAGE);
            if (currentBoardPage < totalPages - 1) {
                currentBoardPage++;
                renderBoardPage();
            }
        });
        renderTemplatesByCategory('standard');
    }

    // === 升級後：規則滑動開關邏輯 ===
    document.querySelectorAll('.toggle-group').forEach(group => {
        const targetId = group.getAttribute('data-target');
        const hiddenInput = document.getElementById(targetId);
        const options = group.querySelectorAll('.toggle-option');

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                options.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                if (hiddenInput) hiddenInput.value = opt.getAttribute('data-value');
            });
        });
    });

    // === 房主建立房間 ===
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const inputEl = document.getElementById('input-host-room-id');
        const nameEl = document.getElementById('input-host-name');
        
        let rawId = inputEl ? inputEl.value.trim() : "";
        let hostName = nameEl && nameEl.value.trim() !== "" ? nameEl.value.trim() : "房主";
        
        // 恢復被遺失的防呆邏輯
        let roomId = rawId.replace(/\D/g, '');
        if (rawId.length > 0 && roomId.length !== 4) {
            return alert('自訂房號必須是「4 位數的純數字」！\n(或者您可以完全留空，讓系統自動產生)');
        }
        if (!roomId) {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        }

        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-player').classList.remove('hidden');
        
        // 創房時預設展開房主專屬設定 Modal
        const hostModal = document.getElementById('host-control-modal');
        if (hostModal) hostModal.classList.remove('hidden');
        
        if (typeof window.initHost === 'function') window.initHost(roomId, hostName);
    });

    // === 玩家加入房間 ===
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
        const roomId = document.getElementById('input-room-id').value.trim();
        const name = document.getElementById('input-player-name').value.trim();
        
        if (!roomId || !name) return alert('請輸入房間代碼與您的暱稱！');
        
        document.getElementById('section-entry').classList.add('hidden');
        document.getElementById('section-player').classList.remove('hidden');
        
        if (typeof window.initPlayer === 'function') window.initPlayer(roomId, name);
    });

    // === 房主確認發牌 ===
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
        const selectedBoardId = document.getElementById('select-board-template').value;
        const board = BOARD_TEMPLATES.find(t => t.id === selectedBoardId);
        if (!board) return alert("請先選擇版型！");

        const gameRules = {
            witchSave: document.getElementById('rule-witch-save').value,
            winCondition: document.getElementById('rule-win-condition').value,
            tieResolution: 'pk',
            sheriff: document.getElementById('rule-sheriff').value,
            deathReveal: document.getElementById('rule-death-reveal').value,
            sheriffExplodeRule: document.getElementById('rule-sheriff-explode').value,
            squareCard: document.getElementById('rule-square-card').value,
            firstNightKill: document.getElementById('rule-first-night-kill').value,
            speechTime: parseInt(document.getElementById('rule-speech-time').value, 10),
            hiddenWolfType: document.getElementById('rule-hidden-wolf-type')?.value || 'strong' // [擴充] 寫入隱狼類型
        };
        
        // 發牌後自動隱藏控制視窗，讓房主專心看卡牌動畫
        const hostModal = document.getElementById('host-control-modal');
        if (hostModal) hostModal.classList.add('hidden');
        
        if (typeof window.startGame === 'function') {
            window.startGame(board.deck, board.name, gameRules);
        }
    });

    // === 房主專屬 Modal 控制事件 ===
    document.getElementById('btn-host-settings')?.addEventListener('click', () => {
        document.getElementById('host-control-modal').classList.remove('hidden');
    });
    
    document.getElementById('close-host-modal-btn')?.addEventListener('click', () => {
        document.getElementById('host-control-modal').classList.add('hidden');
    });
    
    document.getElementById('btn-toggle-master-log')?.addEventListener('click', () => {
        const logContent = document.getElementById('host-master-log-content');
        if (logContent) {
            logContent.classList.toggle('hidden');
            if (!logContent.classList.contains('hidden')) {
                logContent.scrollTop = logContent.scrollHeight;
            }
        }
    });

    // === 卡牌翻轉事件 ===
    document.getElementById('my-card-container')?.addEventListener('click', () => {
        document.getElementById('my-card-flipper')?.classList.toggle('flipped');
    });
});
