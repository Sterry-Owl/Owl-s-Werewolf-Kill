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