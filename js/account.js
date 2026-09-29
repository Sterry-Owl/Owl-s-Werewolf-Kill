// ==========================================
// 帳號與戰績持久化服務模組 (Account & Stats Service)
// 檔案位置: js/account.js
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCtOC2xHd8TV0Ll4zp7rMas0oQWOVrQlyw",
    authDomain: "owl-s-werewolf.firebaseapp.com",
    projectId: "owl-s-werewolf",
    storageBucket: "owl-s-werewolf.firebasestorage.app",
    messagingSenderId: "917274091943",
    appId: "1:917274091943:web:963aff27620e6570dc1682",
    measurementId: "G-8MXN9XL9JX"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

window.AccountService = {
    currentUser: null,
    isRegisterMode: false,

    // 初始化狀態監聽 (異步取得 Firestore 儲存之自訂暱稱)
    init: function(onUserChanged) {
        if (!auth) return;
        auth.onAuthStateChanged(async user => {
            AccountService.currentUser = user;
            if (typeof onUserChanged === 'function') {
                let displayName = user ? user.displayName : null;
                if (user && db) {
                    try {
                        const doc = await db.collection("users").doc(user.uid).get();
                        if (doc.exists && doc.data().name) {
                            displayName = doc.data().name;
                        }
                    } catch (e) {
                        console.warn("無法取得使用者 Firestore 暱稱", e);
                    }
                }
                onUserChanged(user, displayName);
            }
        });
    },

    updateNickname: async function(newDisplayName) {
        if (!auth || !auth.currentUser) throw new Error("尚未登入");
        const uid = auth.currentUser.uid;
        await auth.currentUser.updateProfile({ displayName: newDisplayName });
        if (db) {
            await db.collection("users").doc(uid).set({
                name: newDisplayName
            }, { merge: true });
        }
        return newDisplayName;
    },

    signUp: async function(email, password, displayName) {
        if (!auth || !db) throw new Error("Firebase 服務未初始化");
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: displayName });

        await db.collection("users").doc(cred.user.uid).set({
            uid: cred.user.uid,
            name: displayName,
            totalGames: 0,
            wins: 0,
            losses: 0,
            stats: {
                all: { total: 0, wins: 0, losses: 0 },
                standard: { total: 0, wins: 0, losses: 0 },
                quick: { total: 0, wins: 0, losses: 0 },
                fun: { total: 0, wins: 0, losses: 0 }
            },
            roleCounts: {
                all: {},
                standard: {},
                quick: {},
                fun: {}
            },
            recentMatches: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        AccountService.currentUser = cred.user;
        return cred.user;
    },

    signIn: async function(email, password) {
        if (!auth) throw new Error("Firebase Auth 未初始化");
        const cred = await auth.signInWithEmailAndPassword(email, password);
        AccountService.currentUser = cred.user;
        return cred.user;
    },

    signOut: async function() {
        if (!auth) return;
        await auth.signOut();
        AccountService.currentUser = null;
    },

    getUserStats: async function(uid) {
        if (!db) return null;
        const doc = await db.collection("users").doc(uid).get();
        return doc.exists ? doc.data() : null;
    },

    // [修復與升級] 批次寫入：使用巢狀物件語法，並維護各模式統計與最近 10 場對局清單
    recordGameResult: async function(gameData) {
        if (!db) return;

        let boardName = "自訂對局";
        let category = "standard";
        let categoryName = "進階場";
        let winner = "";
        let playersResult = [];

        if (Array.isArray(gameData)) {
            playersResult = gameData;
        } else if (gameData && typeof gameData === 'object') {
            boardName = gameData.boardName || "自訂對局";
            category = gameData.category || "standard";
            categoryName = gameData.categoryName || "進階場";
            winner = gameData.winner || "";
            playersResult = gameData.playersResult || [];
        }

        const now = new Date();
        const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        for (const p of playersResult) {
            if (!p.uid) continue;

            const userRef = db.collection("users").doc(p.uid);
            const doc = await userRef.get();
            const currentData = doc.exists ? doc.data() : {};

            // 1. 各模式勝率統計 (all, standard, quick, fun)
            const stats = currentData.stats || {
                all: { total: currentData.totalGames || 0, wins: currentData.wins || 0, losses: currentData.losses || 0 }
            };
            stats.all = stats.all || { total: 0, wins: 0, losses: 0 };
            stats[category] = stats[category] || { total: 0, wins: 0, losses: 0 };

            ['all', category].forEach(cat => {
                stats[cat].total = (stats[cat].total || 0) + 1;
                if (p.isWinner) stats[cat].wins = (stats[cat].wins || 0) + 1;
                else stats[cat].losses = (stats[cat].losses || 0) + 1;
            });

            // 2. 角色次數統計 (全模式與特定模式)
            const roleCounts = currentData.roleCounts || { all: {} };
            if (currentData.roleCounts && !currentData.roleCounts.all) {
                roleCounts.all = { ...currentData.roleCounts };
            }
            roleCounts.all = roleCounts.all || {};
            roleCounts[category] = roleCounts[category] || {};

            // 向下相容清理：將舊版本產生的點號鍵值 (如 "roleCounts.平民") 併入 all
            Object.keys(currentData).forEach(k => {
                if (k.startsWith('roleCounts.')) {
                    const rName = k.replace('roleCounts.', '');
                    roleCounts.all[rName] = (roleCounts.all[rName] || 0) + currentData[k];
                }
            });

            roleCounts.all[p.role] = (roleCounts.all[p.role] || 0) + 1;
            roleCounts[category][p.role] = (roleCounts[category][p.role] || 0) + 1;

            const recentMatches = currentData.recentMatches || [];
            recentMatches.unshift({
                dateStr: dateStr,
                boardName: boardName,
                categoryName: categoryName,
                role: p.role,
                isWinner: p.isWinner,
                winnerFaction: winner
            });
            if (recentMatches.length > 10) {
                recentMatches.length = 10;
            }

            await userRef.set({
                stats: stats,
                roleCounts: roleCounts,
                recentMatches: recentMatches,
                totalGames: stats.all.total,
                wins: stats.all.wins,
                losses: stats.all.losses
            }, { merge: true });
        }
    }
};

// ==========================================
// 大廳介面與 Modal 事件自我閉合綁定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const userDisplay = document.getElementById('account-user-display');
    const btnOpenAuth = document.getElementById('btn-open-auth');
    const btnOpenStats = document.getElementById('btn-open-stats');
    const btnLogout = document.getElementById('btn-account-logout');
    
    const authModal = document.getElementById('auth-modal');
    const closeAuthBtn = document.getElementById('close-auth-btn');
    const authTitle = document.getElementById('auth-modal-title');
    const authErrorMsg = document.getElementById('auth-error-msg');
    const authDisplayName = document.getElementById('auth-display-name');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const authTogglePrompt = document.getElementById('auth-toggle-prompt');
    const authToggleMode = document.getElementById('auth-toggle-mode');

    const statsModal = document.getElementById('stats-modal');
    const closeStatsBtn = document.getElementById('close-stats-btn');
    const statsContent = document.getElementById('stats-modal-content');

    const inputHostName = document.getElementById('input-host-name');
    const inputPlayerName = document.getElementById('input-player-name');

    // 監聽登入狀態改變
    AccountService.init((user, resolvedName) => {
        if (user) {
            const name = resolvedName || user.displayName || user.email.split('@')[0];
            if (userDisplay) userDisplay.textContent = `玩家：${name}`;
            if (btnOpenAuth) btnOpenAuth.classList.add('hidden');
            if (btnOpenStats) btnOpenStats.classList.remove('hidden');
            if (btnLogout) btnLogout.classList.remove('hidden');

            if (inputHostName) inputHostName.value = name;
            if (inputPlayerName) inputPlayerName.value = name;
        } else {
            if (userDisplay) userDisplay.textContent = '訪客 (未登入)';
            if (btnOpenAuth) btnOpenAuth.classList.remove('hidden');
            if (btnOpenStats) btnOpenStats.classList.add('hidden');
            if (btnLogout) btnLogout.classList.add('hidden');
        }
    });

    // 登入/註冊切換
    if (authToggleMode) {
        authToggleMode.addEventListener('click', () => {
            AccountService.isRegisterMode = !AccountService.isRegisterMode;
            authErrorMsg.style.display = 'none';
            if (AccountService.isRegisterMode) {
                authTitle.textContent = '註冊帳號';
                authDisplayName.style.display = 'block';
                btnAuthSubmit.textContent = '完成註冊';
                authTogglePrompt.textContent = '已有帳號？';
                authToggleMode.textContent = '返回登入';
            } else {
                authTitle.textContent = '帳號登入';
                authDisplayName.style.display = 'none';
                btnAuthSubmit.textContent = '登入';
                authTogglePrompt.textContent = '還沒有帳號？';
                authToggleMode.textContent = '立即註冊';
            }
        });
    }

    if (btnOpenAuth) {
        btnOpenAuth.addEventListener('click', () => {
            authModal.classList.remove('hidden');
            authErrorMsg.style.display = 'none';
        });
    }

    if (closeAuthBtn) {
        closeAuthBtn.addEventListener('click', () => authModal.classList.add('hidden'));
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            AccountService.signOut();
        });
    }

    if (btnAuthSubmit) {
        btnAuthSubmit.addEventListener('click', async () => {
            const email = authEmail.value.trim();
            const pwd = authPassword.value.trim();
            const name = authDisplayName.value.trim();

            authErrorMsg.style.display = 'none';

            if (!email || !pwd) {
                authErrorMsg.textContent = '請輸入電子信箱與密碼。';
                authErrorMsg.style.display = 'block';
                return;
            }

            try {
                if (AccountService.isRegisterMode) {
                    if (!name) {
                        authErrorMsg.textContent = '請輸入玩家暱稱。';
                        authErrorMsg.style.display = 'block';
                        return;
                    }
                    await AccountService.signUp(email, pwd, name);
                } else {
                    await AccountService.signIn(email, pwd);
                }
                authModal.classList.add('hidden');
                authEmail.value = '';
                authPassword.value = '';
                authDisplayName.value = '';
            } catch (err) {
                authErrorMsg.textContent = err.message;
                authErrorMsg.style.display = 'block';
            }
        });
    }

    // 個人戰績面板顯示
    if (btnOpenStats) {
        btnOpenStats.addEventListener('click', async () => {
            statsModal.classList.remove('hidden');
            statsContent.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">資料讀取中...</div>';

            if (!AccountService.currentUser) return;
            const data = await AccountService.getUserStats(AccountService.currentUser.uid);

            if (!data) {
                statsContent.innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 20px;">查無戰績資料</div>';
                return;
            }

            const stats = data.stats || { all: { total: data.totalGames || 0, wins: data.wins || 0, losses: data.losses || 0 } };
            
            // 相容處理：若角色結構為舊版扁平格式或帶有頂層點號，全部提取至 all
            let baseRoles = {};
            if (data.roleCounts) {
                if (data.roleCounts.all) baseRoles = { ...data.roleCounts.all };
                else baseRoles = { ...data.roleCounts };
            }
            Object.keys(data).forEach(k => {
                if (k.startsWith('roleCounts.')) {
                    const rName = k.replace('roleCounts.', '');
                    baseRoles[rName] = (baseRoles[rName] || 0) + data[k];
                }
            });
            const roleCounts = data.roleCounts && data.roleCounts.all ? data.roleCounts : { all: baseRoles };
            roleCounts.all = baseRoles;

            const recentMatches = data.recentMatches || [];

            let currentWinTab = 'all';
            let currentRoleTab = 'all';

            const renderFullProfileView = () => {
                // 區塊一：勝率數據計算
                const curStat = stats[currentWinTab] || { total: 0, wins: 0, losses: 0 };
                const winRate = curStat.total > 0 ? ((curStat.wins / curStat.total) * 100).toFixed(1) : '0.0';

                // 區塊二：角色數據計算與排序
                const curRoles = roleCounts[currentRoleTab] || {};
                const sortedRoles = Object.entries(curRoles).sort((a, b) => b[1] - a[1]);
                let roleRowsHtml = sortedRoles.length > 0 
                    ? sortedRoles.map(([r, c]) => `
                        <div style="display:flex; justify-content:space-between; padding:5px 8px; border-bottom:1px solid #2a2a2a; font-size:12px;">
                            <span style="color:var(--wolf-yellow); font-weight:bold;">${r}</span>
                            <span>${c} 次</span>
                        </div>`).join('')
                    : '<div style="color:#666; text-align:center; padding:12px; font-size:12px;">該模式尚無角色獲取紀錄</div>';

                // 區塊三：最近 10 場對局卡片
                let matchesHtml = recentMatches.length > 0
                    ? recentMatches.map(m => `
                        <div style="background:#141414; border:1px solid #2a2a2a; border-radius:4px; padding:8px 10px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-weight:bold; color:#fff; font-size:12px;">${m.boardName} <span style="font-size:10px; color:#888;">(${m.categoryName})</span></div>
                                <div style="font-size:11px; color:#aaa; margin-top:2px;">身分：<span style="color:var(--wolf-yellow); font-weight:bold;">${m.role}</span> | ${m.dateStr}</div>
                            </div>
                            <div style="font-weight:bold; font-size:13px; color:${m.isWinner ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                ${m.isWinner ? '勝利' : '失敗'}
                            </div>
                        </div>`).join('')
                    : '<div style="color:#666; text-align:center; padding:15px; font-size:12px;">尚無對局紀錄</div>';

                const createTab = (targetKey, labelText, currentActive, attrName) => `
                    <div ${attrName}="${targetKey}" style="flex:1; text-align:center; padding:4px 0; font-size:11px; cursor:pointer; border-radius:4px; ${currentActive === targetKey ? 'background:var(--accent-blue); color:#fff; font-weight:bold;' : 'color:#888; background:#111;'}">
                        ${labelText}
                    </div>`;

                statsContent.innerHTML = `
                    <!-- 暱稱修改區塊 -->
                    <div style="background:#1e1e1e; padding:10px; border-radius:6px; border:1px solid #333; margin-bottom:10px;">
                        <div style="font-size:12px; font-weight:bold; color:var(--accent-blue); margin-bottom:6px;">修改個人暱稱</div>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="stats-nickname-input" value="${data.name || ''}" placeholder="請輸入新暱稱" maxlength="12" style="flex:1; padding:6px 10px; margin:0; font-size:12px; background:#2a2a2a; border:1px solid #444; border-radius:4px; color:#fff;">
                            <button id="btn-save-nickname" class="btn-success" style="padding:6px 12px; font-size:11px; white-space:nowrap;">儲存</button>
                        </div>
                        <div id="stats-nickname-msg" style="font-size:11px; margin-top:4px; display:none;"></div>
                    </div>

                    <!-- 區塊一：勝率總覽 (含分頁) -->
                    <div style="background:#1e1e1e; padding:10px; border-radius:6px; border:1px solid #333; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span id="stats-profile-name" style="font-size:13px; font-weight:bold; color:#fff;">${data.name || '玩家'}</span>
                            <div style="display:flex; gap:4px; width:65%;">
                                ${createTab('all', '所有', currentWinTab, 'data-wintab')}
                                ${createTab('standard', '進階場', currentWinTab, 'data-wintab')}
                                ${createTab('quick', '快速場', currentWinTab, 'data-wintab')}
                                ${createTab('fun', '娛樂場', currentWinTab, 'data-wintab')}
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(4, 1fr); text-align:center; gap:6px; font-size:11px;">
                            <div style="background:#111; padding:6px; border-radius:4px;">總局數<br><span style="color:#fff; font-weight:bold;">${curStat.total}</span></div>
                            <div style="background:#111; padding:6px; border-radius:4px;">勝利<br><span style="color:var(--accent-green); font-weight:bold;">${curStat.wins}</span></div>
                            <div style="background:#111; padding:6px; border-radius:4px;">失敗<br><span style="color:var(--accent-red); font-weight:bold;">${curStat.losses}</span></div>
                            <div style="background:#111; padding:6px; border-radius:4px;">勝率<br><span style="color:var(--accent-blue); font-weight:bold;">${winRate}%</span></div>
                        </div>
                    </div>

                    <!-- 區塊二：角色獲取統計 (含分頁) -->
                    <div style="background:#1e1e1e; padding:10px; border-radius:6px; border:1px solid #333; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:12px; font-weight:bold; color:var(--accent-blue);">角色獲取統計</span>
                            <div style="display:flex; gap:4px; width:65%;">
                                ${createTab('all', '所有', currentRoleTab, 'data-roletab')}
                                ${createTab('standard', '進階場', currentRoleTab, 'data-roletab')}
                                ${createTab('quick', '快速場', currentRoleTab, 'data-roletab')}
                                ${createTab('fun', '娛樂場', currentRoleTab, 'data-roletab')}
                            </div>
                        </div>
                        <div style="background:#111; border-radius:4px; max-height:120px; overflow-y:auto; padding:2px 4px;">
                            ${roleRowsHtml}
                        </div>
                    </div>

                    <!-- 區塊三：最近 10 場戰績 (獨立可滾動) -->
                    <div style="background:#1e1e1e; padding:10px; border-radius:6px; border:1px solid #333;">
                        <div style="font-size:12px; font-weight:bold; color:var(--accent-blue); margin-bottom:8px;">最近 10 場戰績</div>
                        <div style="max-height:150px; overflow-y:auto; padding-right:4px;">
                            ${matchesHtml}
                        </div>
                    </div>
                `;

                // 綁定勝率分頁切換
                statsContent.querySelectorAll('[data-wintab]').forEach(el => {
                    el.addEventListener('click', (e) => {
                        currentWinTab = e.currentTarget.getAttribute('data-wintab');
                        renderFullProfileView();
                    });
                });

                // 綁定角色統計分頁切換
                statsContent.querySelectorAll('[data-roletab]').forEach(el => {
                    el.addEventListener('click', (e) => {
                        currentRoleTab = e.currentTarget.getAttribute('data-roletab');
                        renderFullProfileView();
                    });
                });

                // 綁定暱稱修改保存邏輯
                const btnSave = document.getElementById('btn-save-nickname');
                const nickInput = document.getElementById('stats-nickname-input');
                const nickMsg = document.getElementById('stats-nickname-msg');
                if (btnSave && nickInput) {
                    btnSave.addEventListener('click', async () => {
                        const newName = nickInput.value.trim();
                        if (!newName) return;
                        try {
                            btnSave.disabled = true;
                            await AccountService.updateNickname(newName);
                            nickMsg.textContent = '暱稱已更新。';
                            nickMsg.style.color = 'var(--accent-green)';
                            nickMsg.style.display = 'block';
                            data.name = newName;
                            document.getElementById('stats-profile-name').textContent = newName;
                            if (userDisplay) userDisplay.textContent = `玩家：${newName}`;
                            if (inputHostName) inputHostName.value = newName;
                            if (inputPlayerName) inputPlayerName.value = newName;
                        } catch (err) {
                            nickMsg.textContent = `更新失敗：${err.message}`;
                            nickMsg.style.color = 'var(--accent-red)';
                            nickMsg.style.display = 'block';
                        } finally {
                            btnSave.disabled = false;
                        }
                    });
                }
            };

            renderFullProfileView();
        });
    }

            // 綁定暱稱儲存按鈕事件
            const btnSaveNickname = document.getElementById('btn-save-nickname');
            const nicknameInput = document.getElementById('stats-nickname-input');
            const nicknameMsg = document.getElementById('stats-nickname-msg');

            if (btnSaveNickname && nicknameInput && nicknameMsg) {
                btnSaveNickname.addEventListener('click', async () => {
                    const newName = nicknameInput.value.trim();
                    nicknameMsg.style.display = 'none';

                    if (!newName) {
                        nicknameMsg.textContent = '暱稱不能為空。';
                        nicknameMsg.style.color = 'var(--accent-red)';
                        nicknameMsg.style.display = 'block';
                        return;
                    }

                    try {
                        btnSaveNickname.disabled = true;
                        await AccountService.updateNickname(newName);

                        nicknameMsg.textContent = '暱稱已更新。';
                        nicknameMsg.style.color = 'var(--accent-green)';
                        nicknameMsg.style.display = 'block';
                        if (userDisplay) userDisplay.textContent = `玩家：${newName}`;
                        if (inputHostName) inputHostName.value = newName;
                        if (inputPlayerName) inputPlayerName.value = newName;
                        const profileHeader = document.getElementById('stats-profile-name');
                        if (profileHeader) profileHeader.textContent = newName;
                    } catch (err) {
                        nicknameMsg.textContent = `更新失敗：${err.message}`;
                        nicknameMsg.style.color = 'var(--accent-red)';
                        nicknameMsg.style.display = 'block';
                    } finally {
                        btnSaveNickname.disabled = false;
                    }
                });
            }
        });
    }

    if (closeStatsBtn) {
        closeStatsBtn.addEventListener('click', () => statsModal.classList.add('hidden'));
    }
});
