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
                let description = '';

                if (typeof ROLE_DICTIONARY !== 'undefined' && ROLE_DICTIONARY[role]) {
                    const def = ROLE_DICTIONARY[role];
                    description = def.description || '';
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
                
                targetGroup.push(`<span class="role-tooltip-trigger" data-role-name="${role}" data-role-desc="${description}" style="color:${color}; font-weight:bold;">${role}</span>`);
            });
            const renderLine = (arr) => arr.length > 0 ? `<div style="white-space:nowrap; margin-bottom:1px;">${arr.join('<span style="color:#555; margin:0 2px;">、</span>')}</div>` : '';
            previewEl.style.height = '48px';
            
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
    const compendiumModal = document.getElementById('compendium-modal');
    const btnOpenCompendium = document.getElementById('btn-open-compendium');
    const btnCloseCompendium = document.getElementById('close-compendium-btn');
    const gridCompendium = document.getElementById('compendium-grid');

    let activeExpandedRole = null;
    let allRolesList = [];

    if (btnOpenCompendium && compendiumModal) {
        btnOpenCompendium.addEventListener('click', () => {
            allRolesList = Object.keys(ROLE_DICTIONARY).map(role => ({
                name: role,
                ...ROLE_DICTIONARY[role]
            }));
            
            // [新增] 視圖層動態排序：依據神職 -> 狼人 -> 平民 -> 其餘陣營進行分類
            const sortWeight = {
                'god': 1,
                'wolf': 2,
                'villager': 3,
                'third_party': 4,
                'special': 5
            };
            
            allRolesList.sort((a, b) => {
                const weightA = sortWeight[a.type] || 99;
                const weightB = sortWeight[b.type] || 99;
                return weightA - weightB;
            });

            renderCompendium();
            compendiumModal.classList.remove('hidden');
        });

        btnCloseCompendium.addEventListener('click', () => {
            compendiumModal.classList.add('hidden');
        });
    }

    function renderCompendium() {
        gridCompendium.innerHTML = '';
        activeExpandedRole = null;

        // [修改] 拔除分頁邏輯，直接渲染所有角色
        allRolesList.forEach((roleData, idx) => {
            const card = document.createElement('div');
            card.className = 'compendium-card';
            
            const baseRoleName = roleData.name.split(/[-()]/)[0].trim();
            
            card.innerHTML = `
                <img src="./img/${baseRoleName}.webp" onerror="this.onerror=null; this.src='./img/back.webp';">
                <div class="role-name">${roleData.name}</div>
            `;
            
            card.addEventListener('click', () => {
                // 將全體陣列長度作為最後一個參數傳入，維持擴展面板定位相容性
                handleCompendiumCardClick(roleData, card, idx, allRolesList.length);
                
                // [優化] 當點擊展開時，讓該卡牌平滑滾動至可視範圍中央，提升 UX
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            });

            gridCompendium.appendChild(card);
        });
    }

    function handleCompendiumCardClick(roleData, cardElement, idx, totalItemsOnPage) {
        const existingDetail = gridCompendium.querySelector('.compendium-detail');
        const isClickingActive = activeExpandedRole === roleData.name;

        // 重置所有卡片狀態
        gridCompendium.querySelectorAll('.compendium-card').forEach(c => c.classList.remove('active'));

        if (existingDetail) {
            existingDetail.remove();
        }

        // 若點擊的是已展開的卡片，則僅收合，不生成新面板
        if (isClickingActive) {
            activeExpandedRole = null;
            return; 
        }

        activeExpandedRole = roleData.name;
        cardElement.classList.add('active');

        // 生成新的橫跨面板
        const detail = document.createElement('div');
        detail.className = 'compendium-detail';
        
        let factionStr = "";
        if (roleData.faction === 'wolf') factionStr = '🐺 狼人陣營';
        else if (roleData.faction === 'good') factionStr = '🛡️ 好人陣營';
        else if (roleData.faction === 'third_party') factionStr = '🎭 第三方陣營';
        
        detail.innerHTML = `
            <div style="color: var(--wolf-yellow); font-size: 13px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #444; padding-bottom: 4px;">
                ${roleData.name} <span style="font-size:10px; color:#888; margin-left:5px;">${factionStr}</span>
            </div>
            <div>${roleData.description || '無技能說明。'}</div>
        `;

        // 【空間運算】動態適配 3 欄式網格，精準定位至該橫列的最後一個元素
        const COLUMNS = 3;
        const rowStartIndex = Math.floor(idx / COLUMNS) * COLUMNS;
        const rowEndIndex = rowStartIndex + (COLUMNS - 1);
        
        const cards = Array.from(gridCompendium.querySelectorAll('.compendium-card'));
        const insertAfterIndex = Math.min(rowEndIndex, cards.length - 1);
        const insertAfterElement = cards[insertAfterIndex];

        if (insertAfterElement.nextSibling) {
            gridCompendium.insertBefore(detail, insertAfterElement.nextSibling);
        } else {
            gridCompendium.appendChild(detail);
        }
    }
});
// === PWA Service Worker 註冊 ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.error('Service Worker 註冊失敗:', err);
        });
    });
}
