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
            roleCounts: {},
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

    recordGameResult: async function(playersResult) {
        if (!db) return;
        const batch = db.batch();

        playersResult.forEach(p => {
            if (!p.uid) return;

            const userRef = db.collection("users").doc(p.uid);
            const updatePayload = {
                totalGames: firebase.firestore.FieldValue.increment(1),
                wins: p.isWinner ? firebase.firestore.FieldValue.increment(1) : firebase.firestore.FieldValue.increment(0),
                losses: !p.isWinner ? firebase.firestore.FieldValue.increment(1) : firebase.firestore.FieldValue.increment(0),
                [`roleCounts.${p.role}`]: firebase.firestore.FieldValue.increment(1)
            };

            batch.set(userRef, updatePayload, { merge: true });
        });

        await batch.commit();
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

            const total = data.totalGames || 0;
            const wins = data.wins || 0;
            const losses = data.losses || 0;
            const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

            let roleRows = '';
            const roleCounts = data.roleCounts || {};
            const sortedRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);

            if (sortedRoles.length > 0) {
                roleRows = sortedRoles.map(([r, c]) => `
                    <div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #333;">
                        <span style="color: var(--wolf-yellow); font-weight: bold;">${r}</span>
                        <span>${c} 次</span>
                    </div>
                `).join('');
            } else {
                roleRows = '<div style="color: #666; text-align: center; padding: 10px;">尚未獲得任何角色</div>';
            }

            statsContent.innerHTML = `
                <!-- 暱稱修改區塊 -->
                <div style="background: #1e1e1e; padding: 12px; border-radius: 6px; border: 1px solid #333; margin-bottom: 12px;">
                    <div style="font-size: 13px; font-weight: bold; color: var(--accent-blue); margin-bottom: 8px;">修改個人暱稱</div>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="stats-nickname-input" value="${data.name || ''}" placeholder="請輸入新暱稱" maxlength="12" style="flex: 1; padding: 6px 10px; margin: 0; font-size: 13px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #fff;">
                        <button id="btn-save-nickname" class="btn-success" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;">儲存</button>
                    </div>
                    <div id="stats-nickname-msg" style="font-size: 11px; margin-top: 6px; display: none;"></div>
                </div>

                <!-- 戰績概況區塊 -->
                <div style="background: #1e1e1e; padding: 12px; border-radius: 6px; border: 1px solid #333; margin-bottom: 12px;">
                    <div id="stats-profile-name" style="font-size: 15px; font-weight: bold; color: #fff; margin-bottom: 8px;">${data.name || '玩家'}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; text-align: center; gap: 6px; font-size: 12px;">
                        <div style="background: #111; padding: 6px; border-radius: 4px;">總局數<br><span style="color:#fff; font-weight:bold;">${total}</span></div>
                        <div style="background: #111; padding: 6px; border-radius: 4px;">勝利<br><span style="color:var(--accent-green); font-weight:bold;">${wins}</span></div>
                        <div style="background: #111; padding: 6px; border-radius: 4px;">失敗<br><span style="color:var(--accent-red); font-weight:bold;">${losses}</span></div>
                        <div style="background: #111; padding: 6px; border-radius: 4px;">勝率<br><span style="color:var(--accent-blue); font-weight:bold;">${winRate}%</span></div>
                    </div>
                </div>

                <!-- 角色獲取統計區塊 -->
                <div style="font-weight: bold; margin-bottom: 8px; color: var(--accent-blue);">角色獲取統計</div>
                <div style="background: #1e1e1e; border-radius: 6px; border: 1px solid #333; padding: 6px;">
                    ${roleRows}
                </div>
            `;

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
