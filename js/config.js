// ==========================================
// v3.8.0 系統靜態常數與設定檔 (Static Config)
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
    SHERIFF_CANDIDACY: 'SHERIFF_CANDIDACY', 
    SHERIFF_SPEECH: 'SHERIFF_SPEECH', 
    SHERIFF_VOTING: 'SHERIFF_VOTING',
    SHERIFF_TRANSFER: 'SHERIFF_TRANSFER',
    DAY_DISCUSSION: 'DAY_DISCUSSION',
    DAY_VOTING: 'DAY_VOTING',
    PK_SPEECH: 'PK_SPEECH',         
    PK_VOTING: 'PK_VOTING',         
    VOTE_SETTLEMENT: 'VOTE_SETTLEMENT',
    VOTE_RESULT_DISPLAY: 'VOTE_RESULT_DISPLAY', 
    LAST_WORDS: 'LAST_WORDS',                   
    HUNTER_ACTION: 'HUNTER_ACTION',
    WOLFKING_ACTION: 'WOLFKING_ACTION',
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
    WOLF_EXPLODE: 'WOLF_EXPLODE',
    SHERIFF_BAILOUT: 'SHERIFF_BAILOUT'
};

const BOARD_TEMPLATES = [
    { id: "quick-1_6", name: "6人 獵人局", category: 'quick', playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "quick-2_6", name: "6人 女巫局", category: 'quick', playerCount: 6, deck: ["預言家", "女巫", "狼王", "狼人", "平民", "平民"] },
    { id: "quick-3_6", name: "6人 守衛局", category: 'quick', playerCount: 6, deck: ["預言家", "守衛", "狼人", "狼人", "平民", "平民"] },
    { id: "gungun_6", name: "6人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "狼人", "狼人"] },
    { id: "gungun_8", name: "8人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人"] },
    { id: "gungun_10", name: "10人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人"] },
    { id: "test-2_6", name: "6人 狼王守衛(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守衛", "狼王", "狼人", "平民", "平民"] },
    { id: "test-3_6", name: "6人 白狼王騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "白狼王", "狼人", "平民", "平民"] },
    { id: "test-4_6", name: "6人 石像鬼守墓人(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守墓人", "石像鬼", "狼人", "平民", "平民"] },
    { id: "test-5_6", name: "6人 隱狼烏鴉(測試)", category: 'test', playerCount: 6, deck: ["預言家", "烏鴉", "隱狼", "狼人", "平民", "平民"] },
    { id: "test-7_6", name: "6人 狼美人騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼美人", "狼人", "平民", "平民"] },
    { id: "test-8_6", name: "6人 夢魘攝夢人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "攝夢人", "噩夢之影", "狼人", "平民", "平民"] },
    { id: "test-9_6", name: "6人 暗戀者(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "暗戀者"] },
    { id: "test-10_6", name: "6人 燈影預言家(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼王", "狼人", "燈影預言家", "平民"] },
    { id: "test-11_6", name: "6人 惡靈騎士(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "惡靈騎士", "狼人", "平民", "平民"] },
    { id: "test-12_6", name: "6人 機械狼(測試)", category: 'test', playerCount: 6, deck: ["女巫", "魔鏡少女", "守衛", "獵人", "狼人", "機械狼"] },
    { id: "test-12_6", name: "6人 奇蹟商人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "守衛", "奇蹟商人", "狼王", "惡靈騎士"] },
    { id: "survivortwo_7", name: "7人 生還者(雙狼王測試)", category: 'test', playerCount: 7, deck: ["預言家", "守衛", "女巫", "獵人", "狼王", "狼王", "平民"] },
    { id: "survivorstd_7", name: "7人 生還者(標準)", category: 'fun', playerCount: 7, deck: ["預言家", "守衛", "女巫", "獵人", "白狼王", "狼人", "平民"] },
    { id: "noeye_8", name: "8人 無目之夜", category: 'fun', playerCount: 8, deck: ["預言家", "女巫", "獵人", "平民", "平民", "狼人", "隱狼", "石像鬼"] },
    { id: "lastday_8", name: "8人 末日狂徒", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "獵人", "狼人", "狼人", "狼人", "平民", "平民"] },
    { id: "evening_8", name: "8人 諸神黃昏", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "獵人", "女巫", "白痴", "惡靈騎士", "狼王", "白狼王"] },     
    { id: "standard_9", name: "9人 標準局", category: 'quick', playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_10", name: "10人 標準局", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "inw_cl_10", name: "10人 隱狼烏鴉", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "烏鴉", "隱狼", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wwk_kn_10", name: "10人 白狼王騎士", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "騎士", "白狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "crush_10", name: "10人 暗戀者", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "暗戀者"] },
    { id: "lastday_11", name: "11人 末日狂徒", category: 'fun', playerCount: 11, deck: ["預言家", "守墓人", "騎士", "守衛", "石像鬼", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_12", name: "12人 標準局", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_grd_12", name: "12人 狼王守衛", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "gh_gra_12", name: "12人 石像鬼守墓人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守墓人", "石像鬼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "wwk_kn_12", name: "12人 白狼王騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "白狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "inw_cl_12", name: "12人 隱狼烏鴉", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "烏鴉", "隱狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "nim_dgr_12", name: "12人 夢魘攝夢人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "攝夢人", "噩夢之影", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wbt_kn_12", name: "12人 狼美人騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "evkn_12", name: "12人 惡靈騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "惡靈騎士", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "mir_mw_12", name: "12人 魔鏡機械狼", category: 'standard', playerCount: 12, deck: ["魔鏡少女", "女巫", "獵人", "守衛", "機械狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "lightseer_12", name: "12人 燈影預言家", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守墓人", "狼王", "狼人", "狼人", "狼人", "燈影預言家", "平民", "平民", "平民"] },
    { id: "lightseer_12", name: "12人 狼王惡靈+奇蹟商人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "守衛", "奇蹟商人", "狼王", "惡靈騎士", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
];

const ROLE_DICTIONARY = {
    "平民": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "" },
    "暗戀者": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "選擇你的暗戀對象" },
    "燈影預言家": { faction: "good", type: "villager", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的查驗目標" },
    "獵人": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "" },
    "白痴": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "" },
    "狼人": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)" },
    "女巫": { faction: "good", type: "god", nightPhase: "second_half", actionType: "dynamic_buttons", prompt: "女巫請行動" },
    "預言家": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的查驗目標" },
    "狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)" },
    "守衛": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚守護的目標" },
    "白狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus",prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)" },
    "騎士": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "天黑請閉眼" },
    "守墓人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "請確認資訊" },
    "石像鬼": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "石像鬼請行動" },
    "隱狼": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "single_select", prompt: "隱狼請行動" },
    "烏鴉": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的咒詛對象" },
    "噩夢之影": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "噩夢之影請行動" },
    "狼美人": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic_buttons", prompt: "狼美人請行動" },
    "攝夢人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的攝夢目標" },
    "惡靈騎士": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標" },
    "魔鏡少女": { faction: "good", type: "god", nightPhase: "secon_half", actionType: "single_select", prompt: "選擇今晚的查驗目標" },
    "機械狼": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "機械狼請行動" },
    "奇蹟商人": { faction: "good", type: "god", nightPhase: "first_half", actionType: "dynamic", prompt: "奇蹟商人請行動" },
};
