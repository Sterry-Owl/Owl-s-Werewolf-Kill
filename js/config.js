// PeerJS 連線設定 (使用 Google 免費 STUN 伺服器)
const peerConfig = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
        ] 
    } 
};
// 2. 全域狀態變數預設值 (Global State Variables)
const GAME_STATE = {
    isBloodMoonActive: false, // 血月使徒封鎖標記
    isPrinceUsed: false,      // 定序王子技能使用標記
    isMerchantUsed: false,    // 奇蹟商人技能使用標記
    merchantGiftTarget: null, // 幸運兒號碼
    merchantGiftType: null,   // 幸運兒獲得的技能 (guard, poison, seer)
    crowTarget: null,         // 烏鴉詛咒目標
    wolfKillTarget: null,     // 狼人共同襲擊目標
    revengeTarget: null,      // 狼鴉之爪復仇目標
    isWolfCrowAwake: false    // 狼鴉之爪覺醒標記
};

// 3. 角色邏輯字典 (Role Dictionary)
const ROLE_DICTIONARY = {
    // 【被動與不睜眼角色 (順序 0)】
    "平民": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "獵人": { wakeOrder: 0, actionType: "passive", targetLimit: "被動技能", prompt: "死亡後可以使用獵槍擊殺一名玩家" },
    "隱狼": { wakeOrder: 0, actionType: "passive_receive", targetLimit: "被動接收", prompt: "接收所有狼人的身分和號碼" },
    
    // 【白天攔截與中斷階段 (順序 Day)】
    "白痴": { wakeOrder: "Day", actionType: "intercept", targetLimit: "投票出局後發動", prompt: "投票出局後翻牌" },
    "騎士": { wakeOrder: "Day", actionType: "interrupt", targetLimit: "隨時中斷", prompt: "選擇一名玩家進行決鬥" },
    "定序王子": { wakeOrder: "Day", actionType: "intercept", targetLimit: "全局限用一次", prompt: "作廢本次投票" },
    "狼人陣營-自爆": { wakeOrder: "Day", actionType: "interrupt", targetLimit: "隨時中斷", prompt: "立即進入黑夜" },

    // 【夜晚主動技能角色 (順序 1-10)】
    "盜賊": { wakeOrder: 1, actionType: "card_select", targetLimit: "二選一", prompt: "選擇您本局的身分" },
    "邱比特": { wakeOrder: 2, actionType: "double_select", targetLimit: "雙選", prompt: "選擇兩名玩家成為情侶" },
    "咒狐": { wakeOrder: 3, actionType: "none", targetLimit: "無", prompt: "無" },
    "暗戀者": { wakeOrder: 4, actionType: "single_select", targetLimit: "單點", prompt: "選擇本局的暗戀對象" },
    "噩夢之影-恐懼": { wakeOrder: 5, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的恐懼目標" },
    "蝕時狼妃-封鎖": { wakeOrder: 6, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的封鎖目標" },
    "魔術師": { wakeOrder: 7, actionType: "double_select", targetLimit: "雙選", prompt: "選擇今晚兩名交換的目標" },
    "奇蹟商人": { wakeOrder: 8, actionType: "complex_select", targetLimit: "複合雙選", prompt: "請先選擇一項要贈予的技能，接著點選一名幸運兒" },
    "攝夢人": { wakeOrder: 9, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚成為夢遊者的目標" },
    "守衛": { wakeOrder: 10, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚守護的目標" },

    // 【狼人陣營共同行動 (順序 11)】
    "狼人": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼王": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "白狼王": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼美人-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "惡靈騎士": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "噩夢之影-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "血月使徒": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "蝕時狼妃-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼鴉之爪-睜眼": { wakeOrder: 11, actionType: "consensus_dynamic", targetLimit: "共識目標(動態)", prompt: "(覺醒後)選擇今晚的襲擊目標" },

    // 【夜晚主動技能角色 (順序 12-21)】
    "狼美人-魅惑": { wakeOrder: 12, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的魅惑目標" },
    "狼鴉之爪-復仇": { wakeOrder: 13, actionType: "single_select_dynamic", targetLimit: "動態單點", prompt: "(覺醒後)選擇今晚的復仇目標" },
    "石像鬼": { wakeOrder: 14, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的觀察目標" },
    "女巫-解藥": { wakeOrder: 15, actionType: "single_select", targetLimit: "單點", prompt: "選擇是否解救襲擊目標x號(x為數字)" },
    "女巫-毒藥": { wakeOrder: 16, actionType: "single_select", targetLimit: "單點", prompt: "選擇毒殺的目標" },
    "預言家": { wakeOrder: 17, actionType: "single_select", targetLimit: "單點", prompt: "請選擇今晚要查驗的目標" },
    "純白之女": { wakeOrder: 17, actionType: "single_select", targetLimit: "單點", prompt: "請選擇今晚要查驗的目標" },
    "守墓人": { wakeOrder: 18, actionType: "passive_receive", targetLimit: "被動接收", prompt: "昨日放逐出局玩家的陣營是" },
    "烏鴉": { wakeOrder: 19, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚詛咒的目標" },
    "獵魔人": { wakeOrder: 20, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚狩獵的目標" },
    "幸運兒": { wakeOrder: 21, actionType: "dynamic_select", targetLimit: "動態單點", prompt: "(系統將依據獲得之技能自動生成對應提示)" }
};