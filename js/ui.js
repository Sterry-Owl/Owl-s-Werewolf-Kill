// ==================== 介面控制與版面渲染邏輯 ====================

/**
 * 顯示圖書管理員介面並檢查本機連線紀錄
 */
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

/**
 * 處理圖書管理員介面的陣營按鈕點擊與視覺切換
 */
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

/**
 * 顯示玩家加入房間介面
 */
function showPlayerJoin() {
    document.getElementById('role-selection').classList.add('hidden');
    document.getElementById('player-join-section').classList.remove('hidden');
}

/**
 * 渲染主持人視角的圓形座位表
 */
function renderHostCircle() {
    const container = document.getElementById('host-circle-container');
    container.innerHTML = '';
    if(players.length === 0) return;
    
    const radius = 140; // 座位環繞半徑
    const center = 175; // 容器中心點 (350 / 2)
    
    players.forEach((p, i) => {
        // 三角函數計算環狀座標 (從正上方 -90 度開始排)
        const angle = (i / players.length