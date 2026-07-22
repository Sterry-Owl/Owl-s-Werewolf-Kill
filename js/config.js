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
                    'stun:stun2.l.google.com:19302',  // [擴充] Google 備用節點
                    'stun:stun3.l.google.com:19302',  // [擴充] Google 備用節點
                    'stun:stun.cloudflare.com:3478'   // [擴充] Cloudflare 節點 (DNS 解析優化)
                ] 
            },
            // 2. TURN 首選伺服器 (Metered)
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
    PING: 'PING',  // [新增] 應用層心跳檢測
    PONG: 'PONG'   // [新增] 應用層心跳回應
};

// [新增] 網路連線狀態常數，避免模組中出現髒代碼 (硬編碼)
const NETWORK_CONFIG = {
    PING_INTERVAL: 3000,    // 主機每 3 秒發送一次心跳
    TIMEOUT_LIMIT: 10000,   // 客戶端超過 10 秒未收到心跳視為斷線
    RECONNECT_DELAY: 2000   // 觸發斷線後，延遲 2 秒執行靜默重連
};

const BOARD_TEMPLATES = [
    { id: "quick-1_6", name: "6人 獵人局", category: 'fun', playerCount: 6, deck: ["預言家", "獵人", "狼人", "狼人", "平民", "平民"] },
    { id: "quick-2_6", name: "6人 女巫局", category: 'fun', playerCount: 6, deck: ["預言家", "女巫", "狼王", "狼人", "平民", "平民"] },
    { id: "quick-3_6", name: "6人 守衛局", category: 'fun', playerCount: 6, deck: ["預言家", "守衛", "狼人", "狼人", "平民", "平民"] },
    { id: "gungun_6", name: "6人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "狼人", "狼人"] },
    { id: "gungun_8", name: "8人 獵殺潛狼", category: 'fun', playerCount: 6, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "騎士", "狼王", "狼人"] },
    { id: "gungun_10", name: "10人 獵殺潛狼", category: 'fun', playerCount: 10, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人"] },
    { id: "gungun_12", name: "12人 獵殺潛狼", category: 'fun', playerCount: 12, deck: ["獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "獵人", "狼人", "狼人", "狼人", "狼人"] },
    { id: "survivorstd_7", name: "7人 生還者", category: 'fun', playerCount: 7, deck: ["預言家", "守衛", "女巫", "獵人", "白狼王", "狼人", "平民"] },
    { id: "lastday_8", name: "8人 末日狂徒", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "騎士", "狼人", "狼人", "狼人", "平民", "平民"] },
    { id: "evening_8", name: "8人 諸神黃昏", category: 'fun', playerCount: 8, deck: ["預言家", "守衛", "獵人", "女巫", "白痴", "惡靈騎士", "狼王", "白狼王"] }, 
    { id: "test-2_6", name: "6人 狼王守衛(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守衛", "狼王", "狼人", "平民", "平民"] },
    { id: "test-3_6", name: "6人 狼王魔術師(測試)", category: 'test', playerCount: 6, deck: ["預言家", "魔術師", "狼王", "狼人", "女巫", "平民"] },    
    { id: "test-4_6", name: "6人 白狼王騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "白狼王", "狼人", "平民", "平民"] },
    { id: "test-5_6", name: "6人 石像鬼守墓人(測試)", category: 'test', playerCount: 6, deck: ["預言家", "守墓人", "石像鬼", "狼人", "平民", "平民"] },
    { id: "test-6_6", name: "6人 隱狼烏鴉(測試)", category: 'test', playerCount: 6, deck: ["預言家", "烏鴉", "隱狼", "狼人", "平民", "平民"] },
    { id: "test-7_6", name: "6人 狼美人騎士(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼美人", "狼人", "平民", "平民"] },
    { id: "test-8_6", name: "6人 夢魘攝夢人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "攝夢人", "噩夢之影", "狼人", "平民", "平民"] },
    { id: "test-9_6", name: "6人 暗戀者(測試)", category: 'test', playerCount: 6, deck: ["預言家", "女巫", "狼人", "狼人", "平民", "暗戀者"] },
    { id: "test-10_6", name: "6人 燈影預言家(測試)", category: 'test', playerCount: 6, deck: ["預言家", "騎士", "狼王", "狼人", "燈影預言家", "平民"] },
    { id: "test-11_6", name: "6人 惡靈騎士(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "惡靈騎士", "狼人", "平民", "平民"] },
    { id: "test-12_6", name: "6人 機械狼(測試)", category: 'test', playerCount: 6, deck: ["女巫", "魔鏡少女", "守衛", "獵人", "狼人", "機械狼"] },
    { id: "test-13_6", name: "6人 奇蹟商人(測試)", category: 'test', playerCount: 6, deck: ["女巫", "預言家", "守衛", "奇蹟商人", "狼王", "惡靈騎士"] },
    { id: "test-14_6", name: "6人 無目之夜(測試)", category: 'test', playerCount: 6, deck: ["攝夢人", "女巫", "狼鴉之爪", "狼人", "石像鬼", "隱狼"] },
    { id: "test-15_6", name: "6人 血月獵魔人(測試)", category: 'test', playerCount: 6, deck: ["預言家", "獵魔人", "血月使徒", "狼人", "女巫", "平民"] }, 
    { id: "standard_9", name: "9人 標準局", category: 'quick', playerCount: 9, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民"] },
    { id: "standard_10", name: "10人 標準局", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_grd_10", name: "10人 狼王守衛", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "守衛", "狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_mag_10", name: "10人 狼王魔術師", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "魔術師", "狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "inw_cl_10", name: "10人 隱狼烏鴉", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "烏鴉", "隱狼", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wwk_kn_10", name: "10人 白狼王騎士", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "騎士", "白狼王", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wbt_kn_10", name: "10人 狼美人騎士", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "騎士", "狼美人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "gh_gra_10", name: "10人 石像鬼守墓人", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "守墓人", "石像鬼", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "crush_10", name: "10人 暗戀者", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "獵人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "暗戀者"] },
    { id: "noeye_10", name: "10人 無目之夜", category: 'quick', playerCount: 10, deck: ["預言家", "女巫", "攝夢人", "狼人", "狼鴉之爪", "石像鬼", "平民", "平民", "平民", "平民"] },
    { id: "standard_12", name: "12人 標準局", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "白痴", "狼人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_grd_12", name: "12人 狼王守衛", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wk_mag_12", name: "12人 狼王魔術師", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "魔術師", "狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] }, 
    { id: "gh_gra_12", name: "12人 石像鬼守墓人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守墓人", "石像鬼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "wwk_kn_12", name: "12人 白狼王騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "白狼王", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "inw_cl_12", name: "12人 隱狼烏鴉", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "烏鴉", "隱狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "nim_dgr_12", name: "12人 夢魘攝夢人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "攝夢人", "噩夢之影", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "wbt_kn_12", name: "12人 狼美人騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守衛", "狼美人", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "evkn_12", name: "12人 惡靈騎士", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "守衛", "惡靈騎士", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "mir_mw_12", name: "12人 魔鏡機械狼", category: 'standard', playerCount: 12, deck: ["魔鏡少女", "女巫", "獵人", "守衛", "機械狼", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },    
    { id: "lightseer_12", name: "12人 燈影預言家", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "騎士", "守墓人", "狼王", "狼人", "狼人", "狼人", "燈影預言家", "平民", "平民", "平民"] },
    { id: "mirc_12", name: "12人 奇蹟商人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "守衛", "奇蹟商人", "狼王", "惡靈騎士", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
    { id: "noeye_12", name: "12人 無目之夜", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵人", "攝夢人", "狼人", "狼鴉之爪", "隱狼", "石像鬼", "平民", "平民", "平民", "平民"] },
    { id: "bloodmoon_12", name: "12人 血月使徒獵魔人", category: 'standard', playerCount: 12, deck: ["預言家", "女巫", "獵魔人", "白痴", "血月使徒", "狼人", "狼人", "狼人", "平民", "平民", "平民", "平民"] },
];

const ROLE_DICTIONARY = {
    "平民": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "", description:"沒有特殊技能" },
    "暗戀者": { faction: "good", type: "villager", nightPhase: "none", actionType: "none", prompt: "選擇你的暗戀對象", description:"特殊平民；首夜可以且必須選擇一名玩家成為自己的暗戀對象。自身的勝利條件永遠跟隨暗戀對象。" },
    "燈影預言家": { faction: "good", type: "villager", nightPhase: "second_half", actionType: "single_select", prompt: "預言家請行動\n選擇今晚的查驗目標", description:"神職；每晚可查驗一名玩家的陣營。" },
    "獵人": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；出局後可以擊殺一名玩家。吃毒、殉情或成為最後一個出局的神職時不能發動技能。" },
    "白痴": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；被放逐出局時，可以翻牌免除這次出局，但是之後失去投票權且須移交警徽。" },
    "狼人": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)", description:"每天晚上可以擊殺一名玩家。" },
    "女巫": { faction: "good", type: "god", nightPhase: "second_half", actionType: "dynamic_buttons", prompt: "女巫請行動", description:"神職；擁有一瓶解藥和一瓶毒藥，解藥可拯救被狼人襲擊的對象、毒藥可以擊殺玩家。不可在同一晚使用兩瓶藥水。" },
    "預言家": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "預言家請行動\n選擇今晚的查驗目標", description:"神職；每晚可以查驗一名玩家的陣營" },
    "狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)", description:"可自刀、自爆；出局後可以擊殺一名玩家。吃毒、殉情或成為最後一個出局的狼人時不能發動技能。" },
    "守衛": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "守衛請行動\n選擇今晚守護的目標", description:"神職；每晚可以守護一名玩家使其免於狼刀。不可連續兩晚守護同一名玩家。" },
    "白狼王": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus",prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)", description:"可自刀、自爆；自爆時可以擊殺一名玩家。" },
    "騎士": { faction: "good", type: "god", nightPhase: "none", actionType: "none", prompt: "", description:"神職；白天放逐發言時可以決鬥一名玩家。被決鬥者為狼人則該狼人出局、進入夜晚。被決鬥者為好人則騎士出局、白天繼續。" },
    "守墓人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "守墓人請行動\n請確認被放逐者的陣營", description:"神職；每晚可以得知前一天被放逐出局者的陣營。" },
    "石像鬼": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "石像鬼請行動\n選擇今晚的查驗目標", description:"" },
    "隱狼": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "single_select", prompt: "隱狼請行動", description:"不可自爆、不參與襲擊、但知道所有隊友的號碼；被預言家查驗時顯示為「好人」。" },
    "烏鴉": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "烏鴉請行動\n選擇今晚的詛咒對象", description:"神職；每晚可以詛咒一名玩家，白天放逐投票時，該玩家會被額外計算1票。不可連續兩晚詛咒同一名玩家。" },
    "噩夢之影": { faction: "wolf", type: "wolf", nightPhase: ["first_half", "midnight"], actionType: "dynamic_buttons", prompt: "噩夢之影請行動\n選擇今晚的恐懼目標", description:"可自刀、自爆；每晚可以恐懼一名玩家，被恐懼的玩家不可使用技能。若恐懼狼人，整個狼隊都無法刀人。" },
    "狼美人": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic_buttons", prompt: "狼美人請行動\n選擇今晚的魅惑目標", description:"不可自刀、不可自爆；每晚可以魅惑一名玩家，自身出局時被魅惑的玩家殉情出局。不可連續兩晚魅惑同一名玩家。成為最後一個出局的狼人時，這個技能若達成狼人的勝利條件，則狼人勝利。" },
    "攝夢人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "攝夢人請行動\n你必須選擇今晚的夢遊者", description:"神職；每晚可以且必須選擇一名玩家成為夢遊者。夢遊者免疫夜間傷害，但會在攝夢人出局時殉情而死。連續兩晚成為夢遊者會死亡。" },
    "惡靈騎士": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)", description:"不可自刀、自爆；夜間不死。首次受到查驗或毒藥時，將反彈使施放技能者死亡。" },
    "魔鏡少女": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "魔鏡少女請行動\n選擇今晚的查驗目標", description:"神職；每晚可查驗一名玩家的真實身分。" },
    "機械狼": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "機械狼請行動", description:"不可自刀、自爆、不參與襲擊；可以學習一名玩家，被查驗的身分將替換為該玩家。學習後的下個夜晚可以獲得「相對應的技能」。其餘狼人死亡後，機械狼將參與襲擊。" },
    "奇蹟商人": { faction: "good", type: "god", nightPhase: "first_half", actionType: "dynamic", prompt: "奇蹟商人請行動\n請選擇贈禮的目標", description:"神職；首夜可以且必須選擇一名玩家贈送禮物。從查驗、毒藥、守護三者中贈送一項。收禮者立即成為幸運兒，可在夜晚使用該技能。若贈送到狼人，則送禮失敗、奇蹟商人死亡。" },
    "魔術師": { faction: "good", type: "god", nightPhase: "first_half", actionType: "double_select", prompt: "魔術師請行動\n請選擇交換的目標", description:"神職；每晚可以交換兩個號碼，當夜所有技能作用於這兩個號碼上的效果將會互換。每個號碼一局只能被交換一次" },
    "狼鴉之爪": { faction: "wolf", type: "wolf", nightPhase: ["midnight", "second_half"], actionType: "dynamic", prompt: "狼鴉之爪請行動", description:"不可自爆。當場上存活的狼人陣營≤2人時覺醒，參與夜晚襲擊，且解鎖一次無視任何防禦技能的獨立擊殺能力。" },
    "血月使徒": { faction: "wolf", type: "wolf", nightPhase: "midnight", actionType: "consensus", prompt: "選擇今晚的襲擊目標\n(或跳過以空刀)", description:"狼人陣營；可自刀、自爆。自爆後的下一個夜晚，所有神職玩家無法使用技能；若為最後一個出局的狼人，可在出局時指定擊殺一名玩家。" },
    "獵魔人": { faction: "good", type: "god", nightPhase: "second_half", actionType: "single_select", prompt: "獵魔人請行動\n選擇今晚狩獵的目標", description:"神職；從第二晚開始每晚可狩獵一名玩家。若目標為狼人則該狼人死亡；若目標為好人則獵魔人自身死亡。免疫女巫的毒藥。" },
};
