// PeerJS 連線設定 (使用 Google 免費 STUN 伺服器)
const peerConfig = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
        ] 
    } 
};

// ==================== 全域狀態變數 ====================
let peer = null;                // PeerJS 實例
let connections = {};           // 儲存所有與玩家的連線物件
let players = [];               // 房間內玩家名單與狀態 (id, name, card, seat)
let roomConfig = [];            // 主持人設定的本局牌庫配置
let fullDeck = [];              // 洗牌後的完整卡牌陣列
let nextSeatNumber = 1;         // 玩家加入時配置的座位號碼
let myPeerId = null;            // 玩家本身的連線 ID
let isGameDealt = false;        // 遊戲狀態：是否已完成發牌
let library = [];               // 圖書管理員讀取之全域牌庫資料

// 預設卡牌佔位圖片 (Base64 SVG)
const defaultSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%23555"><rect width="80" height="80"/></svg>';

// ==================== 共用工具函數 ====================
/**
 * 處理字串的 Base64 編碼，避免中文編碼錯誤
 * @param {string} data - 欲編碼的原始字串
 * @returns {string} - Base64 編碼字串
 */
function utoa(data) { 
    return btoa(unescape(encodeURIComponent(data))); 
}