// ==================== 玩家邏輯與連線接收 ====================

/**
 * 初始化玩家連線並加入房間
 */
function initPlayer() {
    const roomCode = document.getElementById('join-room-code').value.trim();
    const playerName = document.getElementById('join-player-name').value.trim();
    
    if (!roomCode || !playerName) return alert('請輸入完整資訊');

    const hostId = 'ROOM-' + roomCode;
    peer = new Peer(undefined, peerConfig);
    
    const statusDiv = document.getElementById('player-status');
    statusDiv.innerText = '尋找房間中...';

    peer.on('open', (id) => {
        myPeerId = id; 
        statusDiv.innerText = '建立連線中...';
        
        // 與主持人建立連線
        const conn = peer.connect(hostId, { reliable: true });
        
        conn.on('open', () => {
            document.getElementById('player-join-section').classList.add('hidden');
            document.getElementById('player-hand-section').classList.remove('hidden');
            
            // 傳送加入訊號
            conn.send({ type: 'JOIN', name: playerName });
        });

        // 接收主控端資料
        conn.on('data', (data) => {
            if (data.type === 'CONFIG') {
                const gallery = document.getElementById('player-config-gallery');
                gallery.innerHTML = '';
                let hasCards = false;
                
                data.config.forEach(c => {
                    if (c.qty > 0) {
                        const imgSrc = c.img || defaultSvg;
                        gallery.innerHTML += `
                            <div class="config-card">
                                <img src="${imgSrc}" alt="${c.name}">
                                <div style="font-size:12px;">${c.name}</div>
                                <div class="config-qty-text">× ${c.qty}</div>
                            </div>`;
                        hasCards = true;
                    }
                });
                
                if (!hasCards) gallery.innerHTML = '<p style="color:#666; width:100%;">本局目前無卡牌</p>';
            } 
            else if (data.type === 'PLAYERS_UPDATE') {
                renderPlayerCircle(data.list);
            }
            else if (data.type === 'DEAL') {
                const titleEl = document.getElementById('my-card-title');
                titleEl.innerText = data.card.name;
                titleEl.style.color = 'white';
                
                const factionEl = document.getElementById('my-card-faction');
                if(data.card.faction) { 
                    factionEl.innerText = data.card.faction; 
                    factionEl.classList.remove('hidden'); 
                } else {
                    factionEl.classList.add('hidden');
                }
                
                const imgEl = document.getElementById('my-card-img');
                if (data.card.img) { 
                    imgEl.src = data.card.img; 
                    imgEl.classList.remove('hidden'); 
                } else {
                    imgEl.classList.add('hidden');
                }
            } 
            else if (data.type === 'RESET') {
                const titleEl = document.getElementById('my-card-title');
                titleEl.innerText = '等待發牌...';
                titleEl.style.color = 'var(--text-muted)';
                
                document.getElementById('my-card-faction').classList.add('hidden');
                document.getElementById('my-card-img').classList.add('hidden');
            }
        });
        
        conn.on('error', () => { 
            statusDiv.innerText = '連線斷開。'; 
        });
    });
    
    peer.on('error', () => { 
        statusDiv.innerHTML = `<span style="color:var(--accent-red);">連線失敗，請檢查房號或網路環境。</span>`; 
    });
}