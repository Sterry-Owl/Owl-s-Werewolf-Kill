// ==========================================
// v3.7.0 系統靜態常數與設定檔 (Static Config)
// ==========================================

const PEER_CONFIG = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
        ] 
    } 
};

const GAME_PHASE = {
    LOBBY: 'LOBBY',
    NIGHT_TRANSITION: 'NIGHT_TRANSITION',
    NIGHT_ACTION: 'NIGHT_ACTION',
    DAWN_SETTLEMENT: 'DAWN_SETTLEMENT',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
    DAY_VOTING: 'DAY_VOTING',
    PK_SPEECH: 'PK_SPEECH',         // [新增] 平票 PK 發言
    PK_VOTING: 'PK_VOTING',         // [新增] 平票 PK 投票
    VOTE_SETTLEMENT: 'VOTE_SETTLEMENT',
    VOTE_RESULT_DISPLAY: 'VOTE_RESULT_DISPLAY', 
    LAST_WORDS: 'LAST_WORDS',                   
    HUNTER_ACTION: 'HUNTER_ACTION',
    GAME_OVER: 'GAME_OVER'
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
    { id: "standard_6", name: "6人 獵人局", playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "test_witch_6", name: "6人 女巫局", playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "平民"] },
    { id: "standard_9", name: "9人 標準局", playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_10", name: "10人 標準局", playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "standard_12", name: "12人 標準局", playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] }
];

const ROLE_DICTIONARY = {
    "平民": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "" },
    "獵人": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "" },
    "白痴": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "" },
    "狼人": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標 (或跳過以空刀)" },
    "女巫": { faction: "good", type: "god", nightPhase: "second_half", actionType: "dynamic_buttons", prompt: "女巫請行動" },
    "預言家": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的查驗目標" }
};
