// ==================== 介面控制與版面渲染邏輯 ====================

function showLibrarian() {
    document.getElementById('role-selection').classList.add('hidden');
    document.getElementById('librarian-section').classList.remove('hidden');
    
    const ghUser = localStorage.getItem('gh_user');
    const ghRepo = localStorage.getItem('gh_repo');
    const ghToken = localStorage.getItem('gh_token');
    
    if(ghUser && ghRepo && ghToken) {
        document.getElementById('gh-user').value = ghUser;
        document.getElementById('gh-repo').value = ghRepo;
        document.getElementById('gh-token').value = ghToken;
        saveGitHubAuth(); 
    } else {
        document.getElementById('btn-add-card').innerText = '請先完成連線設定';
        document.getElementById('gh-status').innerText = '無連線紀錄，請輸入資訊並點擊上方按鈕。';
    }
}

function selectFaction(factionName, btnElement) {
    document.getElementById('lib-card-faction').value = factionName;
    const buttons = document.querySelectorAll('.faction-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#444';
    });
    btnElement.classList.add('active');
    btnElement.style.background = 'var(--accent-blue)';
}

function showPlayerJoin() {
    document.getElementById('role-selection').classList.add('hidden');
    document.getElementById('player-join-section').classList.remove('hidden');
}

function renderHostCircle() {
    const container = document.getElementById('host-circle-container');
    container.innerHTML = '';
    if(players.length === 0) return;
    
    const radius = 140; 
    const center = 175; 
    
    // 陣列排序邏輯：依照 seat 屬性由小到大排列
    const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
    
    sortedPlayers.forEach((p, i) => {
        const angle = (i / sortedPlayers.length) * 2 * Math.PI - (Math.PI / 2);
        const x = center + radius * Math.cos(angle) - 30; 
        const y = center + radius * Math.sin(angle) - 30;
        
        const seatDiv = document.createElement('div');
        seatDiv.className = 'seat';
        seatDiv.style.left = `${x}px`; 
        seatDiv.style.top = `${y}px`;
        
        let roleHtml = p.card ? `<div class="role-label">${p.card.name}</div>` : '';
        const shortName = p.name.length > 4 ? p.name.substring(0,4) + '..' : p.name;
        
        seatDiv.innerHTML = `
            ${roleHtml}
            <img class="seat-img" src="./img/seat_${p.seat}.png" alt="Seat ${p.seat}">
            <span class="player-name">${shortName}</span>
        `;
        container.appendChild(seatDiv);
    });
}

function renderPlayerCircle(playersList) {
    const container = document.getElementById('player-circle-container');
    const centerView = container.querySelector('.center-card-view');
    
    container.innerHTML = '';
    container.appendChild(centerView);
    
    if(playersList.length === 0) return;
    
    const radius = 170; 
    const center = 200; 
    
    // 陣列排序邏輯：依照 seat 屬性由小到大排列
    const sortedPlayers = [...playersList].sort((a, b) => a.seat - b.seat);
    
    sortedPlayers.forEach((p, i) => {
        const angle = (i / sortedPlayers.length) * 2 * Math.PI - (Math.PI / 2);
        const x = center + radius * Math.cos(angle) - 30; 
        const y = center + radius * Math.sin(angle) - 30;
        
        const seatDiv = document.createElement('div');
        seatDiv.className = 'seat';
        
        if (p.id === myPeerId) seatDiv.classList.add('is-me');
        
        seatDiv.style.left = `${x}px`; 
        seatDiv.style.top = `${y}px`;
        
        const shortName = p.name.length > 4 ? p.name.substring(0,4) + '..' : p.name;
        
        seatDiv.innerHTML = `
            <img class="seat-img" src="./img/seat_${p.seat}.png" alt="Seat ${p.seat}">
            <span class="player-name">${shortName}</span>
        `;
        container.appendChild(seatDiv);
    });
}