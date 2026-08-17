// ==========================================
// v3.8.0 系統靜態常數與設定檔 (Static Config)
// ==========================================

const GAME_PREFIX = "TWG_WOLF_V4_";

const PEER_CONFIG = { 
    config: { 
        'iceServers': [
            // 1. STUN 伺服器群組：擴充高可用性公共節點
            { 
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',  
                    'stun:stun3.l.google.com:19302',  
                    'stun:stun.cloudflare.com:3478'
                ] 
            },
            
            {
                urls: [
                    'turn:global.relay.metered.ca:80',
                    'turn:global.relay.metered.ca:80?transport=tcp',
                    'turn:global.relay.metered.ca:443',
                    'turns:global.relay.metered.ca:443?transport=tcp'
                ],
                username: 'a89975f53fd97193003482df',
                credential: 'ShgDnEoNfkoSF2fh'
            },
            // 3. TURN 備用伺服器 (擴充模版：當首選節點異常時自動接管)
            // 註：若無備用商用節點，可保持註解狀態。底層將依序嘗試連線。
            /*
            {
                urls: [
                    'turn:your-backup-turn-server.com:3478',
                    'turns:your-backup-turn-server.com:5349?transport=tcp'
                ],
                username: 'your_backup_username',
                credential: 'your_backup_credential'
            }
            */
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
    BLOODMOON_ACTION: 'BLOODMOON_ACTION',
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
    SHERIFF_BAILOUT: 'SHERIFF_BAILOUT',
    PING: 'PING',
    PONG: 'PONG'
};

const NETWORK_CONFIG = {
    PING_INTERVAL: 3000,
    TIMEOUT_LIMIT: 10000,
    RECONNECT_DELAY: 2000
};

const TEMPLATES_TEST = [
    { id: "test-1_6", name: "一人介面(測試)", category: 'test', playerCount: 1, deck: ["預言家"] },
    { id: "test-2_6", name: "狼王守衛(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守衛", "狼王", "狼人", "平民", "平民"] },
    { id: "test-3_6", name: "狼王魔術師(測試)", category: 'test', playerCount: 6, deck: ["預言家", "魔術師", "狼王", "狼人", "女巫", "平民"] },    
    { id: "test-4_6", name: "白狼王騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "白狼王", "狼人", "平民", "平民"] },
    { id: "test-5_6", name: "石像鬼守墓(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守墓人", "石像鬼", "狼人", "平民", "平民"] },
    { id: "test-6_6", name: "隱狼烏鴉(測試)", category: 'test', playerCount: 6, deck: ["預言家", "烏鴉", "隱狼", "狼人", "平民", "平民"] },
    { id: "test-7_6", name: "狼美人騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼美人", "狼人", "平民", "平民"] },
    { id: "test-8_6", name: "夢魘攝夢人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "攝夢人", "噩夢之影", "狼人", "平民", "平民"] },
    { id: "test-9_6", name: "暗戀者(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "暗戀者"] },
    { id: "test-10_6", name: "燈影預言家(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼王", "狼人", "燈影預言家", "平民"] },
    { id: "test-11_6", name: "惡靈騎士(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "惡靈騎士", "狼人", "平民", "平民"] },
    { id: "test-12_6", name: "機械狼(測試)", category: 'test', playerCount: 6, deck: ["女巫", "魔鏡少女", "守衛", "獵人", "狼人", "機械狼"] },
    { id: "test-13_6", name: "奇蹟商人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "守衛", "奇蹟商人", "狼王", "惡靈騎士"] },
    { id: "test-14_6", name: "無目之夜(測試)", category: 'test', playerCount: 6, deck: ["攝夢人", "女巫", "狼鴉之爪", "狼人", "石像鬼", "隱狼"] },
    { id: "test-15_6", name: "血月獵魔人(測試)", category: 'test', playerCount: 6, deck: ["預言家", "獵魔人", "血月使徒", "狼人", "女巫", "平民"] },
    { id: "test-16_6", name: "熊河豚(測試)", category: 'test', playerCount: 6, deck: ["熊", "河豚", "狼人", "狼人", "平民", "平民"] },
    { id: "test-17_6", name: "魅影覺醒預(測試)", category: 'test', playerCount: 6, deck: ["覺醒預言家", "女巫", "尋香魅影", "狼人", "狼人", "獵人"] },
    { id: "test-18_6", name: "永序之輪(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "守衛", "蝕時狼妃", "定序王子", "狼人"] },
    { id: "test-19_6", name: "純白夜影(測試)", category: 'test', playerCount: 6, deck: ["純白之女", "守衛", "狼巫", "狼人", "平民", "平民"] },
    { id: "test-20_6", name: "吹笛不死鳥(測試)", category: 'test', playerCount: 6, deck: ["預言家", "不死鳥", "狼人", "狼人", "平民", "吹笛者"] },
    { id: "test-21_6", name: "高級平民(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "高級平民"] },
    { id: "test-22_6", name: "獵日逐光(測試)", category: 'test', playerCount: 7, deck: ["預言家", "女巫", "攝夢人", "流光伯爵", "狼人", "蝕日侍女", "平民"] },
    { id: "test-23_6", name: "白天動畫(測試)", category: 'test', playerCount: 6, deck: ["騎士", "定序王子", "河豚", "白狼王", "狼人", "平民"] },
    { id: "test-24_6", name: "煉金魔女(測試)", category: 'test', playerCount: 6, deck: ["煉金魔女", "預言家", "狼鴉之爪", "狼人", "平民", "平民"] },
    { id: "test-25_6", name: "時波之亂(測試)", category: 'test', playerCount: 6, deck: ["白晝學者", "預言家", "女巫", "守衛", "狼人", "寂夜導師"] },
    { id: "test-26_6", name: "野孩子復仇者(測試)", category: 'test', playerCount: 7, deck: ["預言家", "女巫", "狼人", "狼人", "暗戀者", "復仇者", "野孩子"] },
    { id: "test-27_6", name: "盜賊邱比特(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "邱比特", "平民", "平民", "盜賊"] },
    { id: "test-28_6", name: "秘密之夜(測試)", category: 'test', playerCount: 6, deck: ["獵魔人", "白痴", "夜之貴族", "狼人", "平民", "平民"] },
];

const TEMPLATES_FUN = [
    { id: "quick-1_6", name: "6人 獵人局", category: 'fun', playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "quick-2_6", name: "6人 女巫局", category: 'fun', playerCount: 6, deck: ["預言家", "女巫", "狼王", "狼人", "平民", "平民"] },
    { id: "quick-3_6", name: "6人 守衛局", category: 'fun', playerCount: 6, deck: ["預言家", "守衛", "狼人", "狼人", "平民", "平民"] },
    { id: "gungun_6", name: "6人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "狼人", "狼人"] },
    { id: "gungun_8", name: "8人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "騎士", "狼王", "狼人"] },
    { id: "gungun_10", name: "10人 獵殺潛狼", category: 'fun', playerCount: 10, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人"] },
    { id: "gungun_12", name: "12人 獵殺潛狼", category: 'fun', playerCount: 12, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人", "狼人"] },
    { id: "whip_8", name: "8人 連連看", category: 'fun', playerCount: 8, deck: ["獵魔人", "獵魔人", "獵魔人", "尋香魅影", "尋香魅影", "尋香魅影", "尋香魅影", "尋香魅影"] },
    { id: "whip_10", name: "10人 連連看", category: 'fun', playerCount: 10, deck: ["獵魔人", "獵魔人", "獵魔人", "獵魔人", "尋香魅影", "尋香魅影", "尋香魅影", "尋香魅影", "尋香魅影", "尋香魅影"] },
    { id: "survivorstd_7", name: "7人 生還者", category: 'fun', playerCount: 7, deck: ["預言家", "守衛", "女巫", "獵人", "白狼王", "狼人", "平民"] },
    { id: "lastday_8", name: "8人 末日狂徒", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "騎士", "狼人", "狼人", "狼人", "平民", "平民"] },
    { id: "evening_8", name: "8人 諸神黃昏", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "獵人", "女巫", "白痴", "惡靈騎士", "狼王", "白狼王"] },
    { id: "eveningnew_8", name: "8人 諸神清晨", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "白晝學者", "女巫", "獵人", "狼王", "隱狼", "寂夜導師"] },
    { id: "evening_10", name: "10人 諸神黃昏", category: 'fun', playerCount: 10, deck: ["預言家", "女巫", "獵人", "流光伯爵", "攝夢人", "定序王子", "血月使徒", "狼王", "蝕時狼妃", "蝕日侍女"] },
    { id: "evening_11", name: "11人 諸神黃昏", category: 'fun', playerCount: 11, deck: ["預言家", "女巫", "獵人", "守衛", "白痴", "白狼王", "狼美人", "血月使徒", "平民", "平民", "平民"] },
];

const TEMPLATES_QUICK = [
    { id: "standard_9", name: "9人 標準局", category: 'quick', playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "change_9", name: "9人 三重變動", category: 'quick', playerCount: 9, deck: ["預言家", "女巫", "守衛", "狼人", "狼人", "石像鬼", "暗戀者", "野孩子", "復仇者"] },
    { id: "standard_10", name: "10人 標準局", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_grd_10", name: "10人 狼王守衛", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "守衛", "狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_mag_10", name: "10人 狼王魔術師", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "魔術師", "狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "inw_cl_10", name: "10人 隱狼烏鴉", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "烏鴉", "隱狼", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wwk_kn_10", name: "10人 白狼王騎士", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "騎士", "白狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wbt_kn_10", name: "10人 狼美人騎士", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "騎士", "狼美人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "gh_gra_10", name: "10人 守墓石像", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "守墓人", "石像鬼", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "nim_dgr_10", name: "10人 夢魘攝夢人", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "攝夢人", "噩夢之影", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "crush_10", name: "10人 暗戀者", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "暗戀者"] },
    { id: "noeye_10", name: "10人 無目之夜", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "攝夢人", "狼人", "狼鴉之爪", "石像鬼", "平民", "平民", "平民", "平民"] },
    { id: "phantom_10", name: "10人 尋香識命", category: 'quick', playerCount: 10, deck: ["覺醒預言家", "女巫", "守衛", "尋香魅影", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "deswhl_10", name: "10人 永序之輪", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "定序王子", "蝕時狼妃", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "animal_10", name: "10人 動物夢境", category: 'quick', playerCount: 10, deck: ["熊", "河豚", "子狐", "狼美人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "pure_10", name: "10人 純白夜影", category: 'quick', playerCount: 10, deck: ["純白之女", "女巫", "守衛", "狼巫", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "mistclaw_10", name: "10人 迷霧鴉影", category: 'quick', playerCount: 10, deck: ["預言家", "煉金魔女", "攝夢人", "狼鴉之爪", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "grabsun_10", name: "10人 獵日逐光", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "流光伯爵", "蝕日侍女", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "flute_10", name: "10人 吹笛不死鳥", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "不死鳥", "狼鴉之爪", "狼人", "狼人", "平民", "平民", "平民", "吹笛者"] },
    { id: "timekeeper_10", name: "10人 時波之亂", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "白晝學者", "寂夜導師", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "standard_11", name: "11人 標準局", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "wk_grd_11", name: "11人 狼王守衛", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "守衛", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "wk_mag_11", name: "11人 狼王魔術師", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "魔術師", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },    
    { id: "inw_cl_11", name: "11人 隱狼烏鴉", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "烏鴉", "隱狼", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "wwk_kn_11", name: "11人 白狼王騎士", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "騎士", "守衛", "白狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "wbt_kn_11", name: "11人 狼美人騎士", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "騎士", "守衛", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },    
    { id: "gh_gra_11", name: "11人 守墓石像", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "守墓人", "石像鬼", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "nim_dgr_11", name: "11人 夢魘攝夢人", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "攝夢人", "噩夢之影", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "crush_11", name: "11人 暗戀者", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "暗戀者"] },
    { id: "noeye_11", name: "11人 無目之夜", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "攝夢人", "狼人", "狼鴉之爪", "石像鬼", "隱狼", "平民", "平民", "平民"] },
    { id: "phantom_11", name: "11人 尋香識命", category: 'quick', playerCount: 11, deck: ["覺醒預言家", "女巫", "獵人", "守衛", "尋香魅影", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "deswhl_11", name: "11人 永序之輪", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "守衛", "定序王子", "蝕時狼妃", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "animal_11", name: "11人 動物夢境", category: 'quick', playerCount: 11, deck: ["熊", "河豚", "子狐", "白貓", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "pure_11", name: "11人 純白夜影", category: 'quick', playerCount: 11, deck: ["純白之女", "女巫", "獵人", "守衛", "狼巫", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "mistclaw_11", name: "11人 迷霧鴉影", category: 'quick', playerCount: 11, deck: ["預言家", "煉金魔女", "攝夢人", "白痴", "狼鴉之爪", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "grabsun_11", name: "11人 獵日逐光", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "攝夢人", "流光伯爵", "蝕日侍女", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "flute_11", name: "11人 吹笛不死鳥", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "獵人", "不死鳥", "狼鴉之爪", "狼人", "狼人", "狼人", "平民", "平民", "吹笛者"] },
    { id: "timekeeper_11", name: "11人 時波之亂", category: 'quick', playerCount: 11, deck: ["預言家", "女巫", "守衛", "白晝學者", "寂夜導師", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
];

const TEMPLATES_STANDARD = [
    { id: "standard_12", name: "12人 標準局", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_grd_12", name: "12人 狼王守衛", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_mag_12", name: "12人 狼王魔術師", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "魔術師", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "gh_gra_12", name: "12人 守墓石像", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守墓人", "石像鬼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "wwk_kn_12", name: "12人 白狼王騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "白狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "inw_cl_12", name: "12人 隱狼烏鴉", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "烏鴉", "隱狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "nim_dgr_12", name: "12人 夢魘攝夢人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "攝夢人", "噩夢之影", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wbt_kn_12", name: "12人 狼美人騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "evkn_12", name: "12人 惡靈騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "惡靈騎士", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "mir_mw_12", name: "12人 魔鏡機械狼", category: 'standard', playerCount: 12, deck: ["魔鏡少女", "女巫", "獵人", "守衛", "機械狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "lightseer_12", name: "12人 燈影預言家", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "狼美人", "狼人", "狼人", "狼人", "燈影預言家", "平民", "平民", "平民"] },
    { id: "mirc_12", name: "12人 奇蹟商人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "守衛", "奇蹟商人", "狼王", "惡靈騎士", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "noeye_12", name: "12人 無目之夜", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "攝夢人", "狼人", "狼鴉之爪", "隱狼", "石像鬼", "平民", "平民", "平民", "平民"] },
    { id: "bloodmoon_12", name: "12人 血月獵魔人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵魔人", "白痴", "血月使徒", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "phantom_12", name: "12人 尋香識命", category: 'standard', playerCount: 12, deck: ["覺醒預言家", "女巫", "獵人", "守衛", "尋香魅影", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "animal_12", name: "12人 動物夢境", category: 'standard', playerCount: 12, deck: ["熊", "河豚", "子狐", "白貓", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "deswhl_12", name: "12人 永序之輪", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "守衛", "定序王子", "蝕時狼妃", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "flute_12", name: "12人 吹笛不死鳥", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "不死鳥", "狼鴉之爪", "狼人", "狼人", "狼人", "平民", "平民", "平民", "吹笛者"] },
    { id: "pure_12", name: "12人 純白夜影", category: 'standard', playerCount: 12, deck: ["純白之女", "女巫", "守衛", "獵人", "狼巫", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "grabsun_12", name: "12人 獵日逐光", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "攝夢人", "流光伯爵", "蝕日侍女", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "mistclaw_12", name: "12人 迷霧鴉影", category: 'standard', playerCount: 12, deck: ["預言家", "煉金魔女", "攝夢人", "白痴", "狼鴉之爪", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "change_12", name: "12人 三重底限", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "暗戀者", "野孩子", "復仇者"] },
    { id: "timekeeper_12", name: "12人 時波之亂", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "守衛", "白晝學者", "寂夜導師", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "thiefandlove_12", name: "12人 盜賊邱比特", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼王", "狼人", "狼人", "平民", "平民", "平民", "平民", "平民", "邱比特", "盜賊"] },
];

const BOARD_TEMPLATES = [
    ...TEMPLATES_TEST,
    ...TEMPLATES_FUN,
    ...TEMPLATES_QUICK,
    ...TEMPLATES_STANDARD
];

const ROLE_DICTIONARY = {
    "平民": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "", description:"沒有特殊技能" },
    "暗戀者": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "選擇你的暗戀對象\n(點擊左右列頭貼以發動技能)", description:"特殊平民；首夜可以且必須選擇一名玩家成為自己的暗戀對象。自身的勝利條件永遠跟隨暗戀對象。" },
    "高級平民": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "", description:"平民牌。首次受到致命傷害的時候不會出局，再次受到致命傷害的時候就會出局。如果被放逐則會直接出局。高級平民不會知道自己有沒有受到過傷害。" },
    "燈影預言家": { faction: "good", type: "villager", nightPhase: "second_half", actionType: "single_select", prompt: "請選擇今晚的查驗目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可查驗一名玩家的陣營。" },
    "獵人": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；出局後可以擊殺一名玩家。吃毒、殉情或成為最後一個出局的神職時不能發動技能。" },
    "白痴": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；被放逐出局時，可以翻牌免除這次出局，但是之後失去投票權且須移交警徽。" },
    "狼人": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(點擊左右列頭貼以發動技能)", description:"每天晚上可以擊殺一名玩家。" },
    "女巫": { faction: "good", type: "god", nightPhase: "second_half", actionType: "dynamic_buttons", prompt: "選擇是否使用解藥或毒藥\n(點擊左右列頭貼以發動技能)", description:"神職；擁有一瓶解藥和一瓶毒藥，解藥可拯救被狼人襲擊的對象、毒藥可以擊殺玩家。不可在同一晚使用兩瓶藥水。" },
    "預言家": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "請選擇今晚的查驗目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以查驗一名玩家的陣營" },
    "狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n\n(點擊左右列頭貼以發動技能)", description:"可自刀、自爆；出局後可以擊殺一名玩家。吃毒、殉情或成為最後一個出局的狼人時不能發動技能。" },
    "守衛": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚守護的目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以守護一名玩家使其免於狼刀。不可連續兩晚守護同一名玩家。" },
    "白狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus",prompt: "選擇今晚的襲擊目標", description:"可自刀、自爆；自爆時可以擊殺一名玩家。" },
    "騎士": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；白天放逐發言時可以決鬥一名玩家。被決鬥者為狼人則該狼人出局、進入夜晚。被決鬥者為好人則騎士出局、白天繼續。" },
    "守墓人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "確認被放逐者的陣營", description:"神職；每晚可以得知前一天被放逐出局者的陣營。" },
    "石像鬼": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "石像鬼請選擇今晚的查驗目標\n(點擊左右列頭貼以發動技能)", description:"" },
    "隱狼": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "single_select", prompt: "", description:"不可自爆、不參與襲擊、但知道所有隊友的號碼；被預言家查驗時顯示為「好人」。" },
    "烏鴉": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的詛咒對象\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以詛咒一名玩家，白天放逐投票時，該玩家會被額外計算1票。不可連續兩晚詛咒同一名玩家。" },
    "噩夢之影": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "選擇今晚的恐懼目標\n(點擊左右列頭貼以發動技能)", description:"可自刀、自爆；每晚可以恐懼一名玩家，被恐懼的玩家不可使用技能。若恐懼狼人，整個狼隊都無法刀人。" },
    "狼美人": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic_buttons", prompt: "選擇今晚的魅惑目標\n(點擊左右列頭貼以發動技能)", description:"不可自刀、不可自爆；每晚可以魅惑一名玩家，自身出局時被魅惑的玩家殉情出局。不可連續兩晚魅惑同一名玩家。成為最後一個出局的狼人時，這個技能若達成狼人的勝利條件，則狼人勝利。" },
    "攝夢人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "你必須選擇今晚的夢遊者\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以且必須選擇一名玩家成為夢遊者。夢遊者免疫夜間傷害，但會在攝夢人出局時殉情而死。連續兩晚成為夢遊者會死亡。" },
    "惡靈騎士": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(點擊左右列頭貼以發動技能)", description:"不可自刀、自爆；夜間不死。首次受到查驗或毒藥時，將反彈使施放技能者死亡。" },
    "魔鏡少女": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的查驗目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可查驗一名玩家的真實身分。" },
    "機械狼": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "機械狼請行動", description:"不可自刀、自爆、不參與襲擊；可以學習一名玩家，被查驗的身分將替換為該玩家。學習後的下個夜晚可以獲得「相對應的技能」。其餘狼人死亡後，機械狼將參與襲擊。" },
    "奇蹟商人": { faction: "good", type: "god", nightPhase: "first_half", actionType: "dynamic", prompt: "奇蹟商人請選擇贈禮的目標\n(點擊左右列頭貼以發動技能)", description:"神職；首夜可以且必須選擇一名玩家贈送禮物。從查驗、毒藥、守護三者中贈送一項。收禮者立即成為幸運兒，可在夜晚使用該技能。若贈送到狼人，則送禮失敗、奇蹟商人死亡。" },
    "魔術師": { faction: "good", type: "god", nightPhase: "first_half", actionType: "double_select", prompt: "請選擇兩名交換的目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以交換兩個號碼，當夜所有技能作用於這兩個號碼上的效果將會互換。每個號碼一局只能被交換一次" },
    "狼鴉之爪": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "狼鴉之爪請行動", description:"不可自爆。當場上存活的狼人陣營≤2人時覺醒，參與夜晚襲擊，且解鎖一次無視任何防禦技能的獨立擊殺能力。" },
    "血月使徒": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(點擊左右列頭貼以發動技能)", description:"狼人陣營；可自刀、自爆。自爆後的下一個夜晚，所有神職玩家無法使用技能；若為最後一個出局的狼人，可在出局時指定擊殺一名玩家。" },
    "獵魔人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚狩獵的目標\n(點擊左右列頭貼以發動技能)", description:"神職；從第二晚開始每晚可狩獵一名玩家。若目標為狼人則該狼人死亡；若目標為好人則獵魔人自身死亡。免疫女巫的毒藥。" },
    "熊": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；相鄰兩位玩家有狼人則白天將公告熊咆哮，否則公告熊沒有咆哮" },
    "河豚": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；僅可發動一次技能，白天將所有投票給自己的玩家炸死。被狼人襲擊時將翻牌然後出局" },
    "尋香魅影": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "double_select", prompt: "尋香魅影請選擇兩名玩家進行連繫\n(點擊左右列頭貼以發動技能)", description:"狼人陣營；不與其他狼人見面、不可自爆。每晚可綁定兩名玩家，其中一人出局則另一人殉情，成功觸發後技能失效。最後一狼時可參與襲擊。" },
    "覺醒預言家": { faction: "good", type: "god", nightPhase: "second_half", actionType: "double_select", prompt: "請選擇兩名查驗目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可以選擇兩名玩家進行複合查驗。若兩人皆為好人則顯示兩人皆為好人，若其中包含狼人則顯示疑似狼人。" },
    "子狐": { faction: "good", type: "god", nightPhase: "first_half", actionType: "single_select", prompt: "子狐請選擇迷惑目標\n(點擊左右列頭貼以發動技能)", description:"神職；每局限用一次，迷惑一名玩家。若目標為狼人，則當晚整個狼隊無法襲擊；若為狼美人，其夜間技能也會失效。" },
    "白貓": {faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；因任何原因出局時，白貓都會翻牌並存活到下一個放逐投票結束之後才出局。(翻牌的白貓不能被任何技能選中)"},
    "蝕時狼妃": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic", prompt: "蝕時狼妃請選擇封鎖目標\n(點擊左右列頭貼以發動技能)", description:"狼人陣營；與狼隊見面。前半夜可發動技能封鎖一名玩家，該玩家當晚若被查驗、毒殺或守護，技能效果將反彈回施放者身上。每局每個號碼僅能被封鎖一次。若成功反彈技能，下一晚將失去技能。" },
    "定序王子": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "", description:"神職；每局限用一次。白天投票後，可翻牌逆轉時光使該次投票作廢，並獲得一次額外發言機會後重新投票。發動技能後的下一個夜晚，可得知從遊戲開始至今的所有放逐目標(含作廢)中共有幾名狼人。" },
    "純白之女": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的查驗目標\n(點擊左右列頭貼以發動技能)", description:"神職；每晚可查驗一名玩家的真實身分。從第二晚起，若查驗到狼人陣營，該名狼人直接死亡。" },
    "狼巫": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "狼巫請行動", description:"狼人陣營；不可自刀、自爆。每晚可查驗一名玩家的真實身分。從第二晚起，若查驗到純白之女，純白之女直接死亡。" },
    "吹笛者": { faction: "third_party", type: "third_party", nightPhase: "first_half", actionType: "up_to_two", prompt: "選擇今晚誘引的目標\n(點擊左右列頭貼以發動技能)", description:"第三方陣營；每晚可選擇誘引 0~2 名玩家。被誘引的玩家會在夜晚互相確認彼此，但不知道吹笛者是誰。當場上所有存活的玩家 (除了吹笛者以外) 都被誘引時，吹笛者單獨獲得勝利。" },
    "不死鳥": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇一名已死亡的玩家進行復活\n(全局限用一次)", description:"神職；從第二晚起，每局限用一次，可選擇復活一名已死亡的玩家。被復活的玩家將完全恢復身分與技能，但在不死鳥出局時會隨之殉情。若復活了狼人陣營，雙方將互相得知對方身分。" },
    "蝕日侍女": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "second_half"], actionType: "dynamic", prompt: "選擇今晚吞噬的目標", description:"狼人陣營，不與狼隊見面，知道所有狼人的號碼；從第二晚起，每局可以吞噬一名非狼人的玩家，使被吞噬的玩家無法使用技能，且自己可以使用其技能。其餘狼人死亡後，蝕日侍女參與襲擊" },
    "流光伯爵": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "選擇今晚的保佑對象", description:"神職；每晚可以保佑一名非自己的玩家，不可連續兩晚保佑相同玩家。被保佑的玩家免疫狼刀、毒藥和連續攝夢，而且被蝕日侍女吞噬時會使蝕日侍女次日死亡。" },
    "煉金魔女": { faction: "good", type: "god", nightPhase: "first_half", actionType: "triple_select", prompt: "選擇未明之霧壟罩的三名玩家", description:"神職；擁有「法老之蛇」跟「未明之霧」各一個。霧可在夜晚拘束三名玩家，使狼隊當晚只能從中選刀且不可空刀。蛇未被使用時會延遲白天死訊至投票前，並可在白天發言結束後使用蛇救活被襲擊者。" },
    "白晝學者": { faction: "good", type: "god", nightPhase: "first_half", actionType: "single_select", prompt: "選擇發動增幅或削弱", description:"神職；從第二晚起，可以使用各一次增幅或削弱。增幅可讓神職額外發動技能或狼人額外刀人；削弱會讓神職被封印，或狼隊當夜空刀。" },
    "寂夜導師": { faction: "wolf", type: "wolf", nightPhase: "first_half", actionType: "single_select", prompt: "選擇發動增幅或削弱", description:"狼人陣營；不參與襲擊、不與狼隊友相見、但被狼人所知。從第二晚起，可以使用各一次增幅或削弱。增幅可讓神職額外發動技能或狼人額外刀人；削弱會讓神職被封印，或狼隊當夜空刀。" },
    "野孩子": { faction: "good", type: "villager", nightPhase: "first_half", actionType: "single_select", prompt: "請選擇你的榜樣\n(點擊左右列頭貼以發動技能)", description:"平民；首夜必須選擇一名玩家作為榜樣。當榜樣出局後，野孩子變為狼人，參與夜間襲擊，且好人需淘汰狂暴的野孩子才可以獲勝。" },
    "復仇者": { faction: "good", type: "villager", nightPhase: "first_half", actionType: "single_select", prompt: "請選擇你的仇恨對象\n(點擊左右列頭貼以發動技能)", description:"平民；首夜必須選擇一名玩家作為仇恨對象。勝利條件永遠與仇恨對象相反。" },
    "邱比特": { faction: "third_party", type: "special", nightPhase: "first_half", actionType: "double_select", prompt: "請選擇兩名玩家成為情侶\n(點擊左右列頭貼以發動技能)", description:"獨立陣營；首夜指定兩名玩家成為情侶。情侶一方死亡另一方將殉情。若情侶為人狼戀，邱比特與情侶組成第三方陣營，須屠城獲勝；否則跟隨情侶所屬陣營獲勝。" },
    "盜賊": { faction: "third_party", type: "special", nightPhase: "thief_action", actionType: "dynamic_buttons", prompt: "請選擇你要替換的身分\n(若底牌有狼人則必須選狼)", description:"獨立陣營；首夜最先行動，可以從多出來的兩張身分牌中挑選一張替換。若底牌包含狼人陣營，則盜賊必須選擇狼人陣營。" },
    "夜之貴族": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "first_half"], actionType: "dynamic", prompt: "夜之貴族請行動", description:"狼人陣營；不可自爆、不可自刀。從第二晚起，每晚後半夜可以指定一名玩家成為夜僕。成為夜僕的玩家會在下個夜晚結束後死亡。場上存在夜僕時不可指定新夜僕。夜僕被獵魔人狩獵時不會死亡，獵魔人也不會死亡。" },
};
