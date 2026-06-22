// ==========================================
// v3.0 系統靜態常數與設定檔 (Static Config)
// ==========================================

const PEER_CONFIG = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
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
    VOTE_SETTLEMENT: 'VOTE_SETTLEMENT'
};

// 封包指令列舉 (Packet Types)
const PACKET_TYPE = {
    JOIN_ROOM: 'JOIN_ROOM',
    JOIN_SUCCESS: 'JOIN_SUCCESS',
    LOBBY_UPDATE: 'LOBBY_UPDATE',
    DECK_UPDATE: 'DECK_UPDATE',
    GAME_INIT: 'GAME_INIT',
    STATE_SYNC: 'STATE_SYNC',       // v3.0 核心：主機強制同步畫面狀態
    WAKE_UP: 'WAKE_UP',
    SLEEP: 'SLEEP',
    ACTION_SUBMIT: 'ACTION_SUBMIT', // 玩家送出夜間行動/開槍
    VOTE_SUBMIT: 'VOTE_SUBMIT',     // 玩家送出選票
    WOLF_PREVIEW: 'WOLF_PREVIEW'    // 狼人隊友選擇預覽
};

// V3.0 標準局基礎角色 (MVP)
const BASE_ROLES = ["平民", "獵人", "白痴", "狼人", "女巫", "預言家"];

// 夜間角色喚醒與行動字典
const ROLE_DICTIONARY = {
    // 【被動與不睜眼角色 (順序 0)】
    "平民": { wakeOrder: 0, actionType: "none", prompt: "" },
    "獵人": { wakeOrder: 0, actionType: "none", prompt: "" },
    "白痴": { wakeOrder: 0, actionType: "none", prompt: "" },

    // 【狼人陣營共識時間 (順序 11)】
    "狼人": { wakeOrder: 11, actionType: "consensus", prompt: "選擇今晚的襲擊目標 (或選擇跳過以空刀)" },

    // 【神職夜間行動 (順序 15-17)】
    "女巫-解藥": { wakeOrder: 15, actionType: "single_select", prompt: "昨晚被襲擊的是 {victim} 號，是否使用解藥？(點選該號碼使用解藥，或點選跳過)" },
    "女巫-毒藥": { wakeOrder: 16, actionType: "single_select", prompt: "選擇你要毒殺的目標 (或點選跳過)" },
    "預言家": { wakeOrder: 17, actionType: "single_select", prompt: "選擇今晚的查驗目標" }
};