// ==========================================
// v3.6.9 系統靜態常數與設定檔 (Static Config)
// ==========================================

const PEER_CONFIG = { 
    config: { 
        'iceServers': [
            // 原本的 Google STUN 伺服器 (負責一般 Wi-Fi 牽線)
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' },
            
            // [新增] 您的專屬 TURN 伺服器 (負責手機熱點與嚴格網路的穿透)
            {
                urls: "turn:owlswerewolf.metered.live:80",
                username: "a89975f53fd97193003482df",
                credential: "ShgDnEoNfkoSF2fh"
            }
        ] 
    } 
};

// 狀態機列舉 (State Machine Enums)
const GAME_PHASE = {
    LOBBY: 'LOBBY',
    NIGHT_TRANSITION: 'NIGHT_TRANSITION',
    NIGHT_ACTION: 'NIGHT_ACTION',
    DAWN_SETTLEMENT: 'DAWN_SETTLEMENT',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
    DAY_VOTING: 'DAY_VOTING',
    VOTE_SETTLEMENT: 'VOTE_SETTLEMENT',
    VOTE_RESULT_DISPLAY: 'VOTE_RESULT_DISPLAY', // [新增] 投票詳細結果展示階段
    LAST_WORDS: 'LAST_WORDS',                   // [新增] 遺言階段
    HUNTER_ACTION: 'HUNTER_ACTION'
};

const PACKET_TYPE = {
    JOIN_ROOM: 'JOIN_ROOM',
    JOIN_SUCCESS: 'JOIN_SUCCESS',
    LOBBY_UPDATE: 'LOBBY_UPDATE',
    DECK_UPDATE: 'DECK_UPDATE',
    GAME_INIT: 'GAME_INIT',
    STATE_SYNC: 'STATE_SYNC',       
    ACTION_SUBMIT: 'ACTION_SUBMIT', 
    VOTE_SUBMIT: 'VOTE_SUBMIT',     
    WOLF_PREVIEW: 'WOLF_PREVIEW',
    WOLF_EXPLODE: 'WOLF_EXPLODE'    // [新增] 狼人自爆封包
};

// 預設版型清單 (Board Templates)
const BOARD_TEMPLATES = [
    { id: "standard_6", name: "6人 標準局 (含獵人)", playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "test_witch_6", name: "6人 女巫測試", playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "平民"] },
    { id: "standard_9", name: "9人 標準局", playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_12", name: "12人 標準局", playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] }
];

// 夜間角色喚醒與行動字典
const ROLE_DICTIONARY = {
    "平民": { wakeOrder: 0, actionType: "none", prompt: "" },
    "獵人": { wakeOrder: 0, actionType: "none", prompt: "" },
    "白痴": { wakeOrder: 0, actionType: "none", prompt: "" },
    "狼人": { wakeOrder: 11, actionType: "consensus", prompt: "選擇今晚的襲擊目標 (或選擇跳過以空刀)" },
    "女巫": { wakeOrder: 15, actionType: "dynamic_buttons", prompt: "女巫請行動" },
    "預言家": { wakeOrder: 17, actionType: "single_select", prompt: "選擇今晚的查驗目標" }
};