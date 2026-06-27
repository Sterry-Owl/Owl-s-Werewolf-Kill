// ==========================================
// v3.6.11 系統靜態常數與設定檔 (Static Config)
// ==========================================

const PEER_CONFIG = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
            // 如有 TURN Server 請自行加在此處
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
    VOTE_RESULT_DISPLAY: 'VOTE_RESULT_DISPLAY', 
    LAST_WORDS: 'LAST_WORDS',                   
    HUNTER_ACTION: 'HUNTER_ACTION',
    GAME_OVER: 'GAME_OVER'  // [新增] 遊戲結束階段
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
    WOLF_EXPLODE: 'WOLF_EXPLODE'    
};

const BOARD_TEMPLATES = [
    { id: "standard_6", name: "6人 標準局 (含獵人)", playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "test_witch_6", name: "6人 女巫測試", playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "平民"] },
    { id: "standard_9", name: "9人 標準局", playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_12", name: "12人 標準局", playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] }
];

// [修改] 新增 faction (陣營) 與 type (種類) 作為勝負判斷的模組化屬性
const ROLE_DICTIONARY = {
    "平民": { faction: "good", type: "villager", wakeOrder: 0, actionType: "none", prompt: "" },
    "獵人": { faction: "good", type: "god", wakeOrder: 0, actionType: "none", prompt: "" },
    "白痴": { faction: "good", type: "god", wakeOrder: 0, actionType: "none", prompt: "" },
    "狼人": { faction: "wolf", type: "wolf", wakeOrder: 11, actionType: "consensus", prompt: "選擇今晚的襲擊目標 (或選擇跳過以空刀)" },
    "女巫": { faction: "good", type: "god", wakeOrder: 15, actionType: "dynamic_buttons", prompt: "女巫請行動" },
    "預言家": { faction: "good", type: "god", wakeOrder: 17, actionType: "single_select", prompt: "選擇今晚的查驗目標" }
};