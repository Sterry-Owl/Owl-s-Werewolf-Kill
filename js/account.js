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

// 初始化 Firebase 實體 (防呆避免重複初始化)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

window.AccountService = {
    currentUser: null,

    // 初始化狀態監聽
    init: function(onUserChanged) {
        if (!auth) {
            console.error("Firebase Auth SDK 尚未載入");
            return;
        }
        auth.onAuthStateChanged(user => {
            AccountService.currentUser = user;
            if (typeof onUserChanged === 'function') {
                onUserChanged(user);
            }
        });
    },

    // 註冊新帳號
    signUp: async function(email, password, displayName) {
        if (!auth || !db) throw new Error("Firebase 服務未初始化");
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: displayName });

        // 建立初始使用者資料文件
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

    // 登入既有帳號
    signIn: async function(email, password) {
        if (!auth) throw new Error("Firebase Auth 未初始化");
        const cred = await auth.signInWithEmailAndPassword(email, password);
        AccountService.currentUser = cred.user;
        return cred.user;
    },

    // 登出
    signOut: async function() {
        if (!auth) return;
        await auth.signOut();
        AccountService.currentUser = null;
    },

    // 讀取個人戰績與角色統計
    getUserStats: async function(uid) {
        if (!db) return null;
        const doc = await db.collection("users").doc(uid).get();
        return doc.exists ? doc.data() : null;
    },

    // 批次結算當局戰績 (使用原子操作 increment 避免競爭條件)
    recordGameResult: async function(playersResult) {
        if (!db) return;
        const batch = db.batch();

        playersResult.forEach(p => {
            if (!p.uid) return; // 略過未綁定帳號的遊客

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
