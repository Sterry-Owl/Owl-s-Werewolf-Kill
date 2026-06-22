const peerConfig = { 
    config: { 
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }, 
            { url: 'stun:stun1.l.google.com:19302' }
        ] 
    } 
};

const GAME_STATE = {
    nightCount: 0,               // 記錄第幾夜
    bloodMoonDelayedDeath: null, // 血月使徒延遲死亡座位
    isBloodMoonActive: false,
    isPrinceUsed: false,
    isKnightUsed: false,
    isWitchAntidoteUsed: false,
    isWitchPoisonUsed: false,
    isMerchantUsed: false,
    merchantGiftTarget: null,
    merchantGiftType: null,
    crowTarget: null,
    wolfKillTarget: null,
    revengeTarget: null,
    isWolfCrowAwake: false
};

const ROLE_DICTIONARY = {
    // 【被動與不睜眼角色 (順序 0)】
    "平民": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "獵人": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "隱狼": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "白痴": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "騎士": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },
    "定序王子": { wakeOrder: 0, actionType: "none", targetLimit: "無", prompt: "" },

    // 【夜晚首輪主動角色 (順序 1-6)】
    "盜賊": { wakeOrder: 1, actionType: "card_select", targetLimit: "單點", prompt: "選擇你要替換的底牌" },
    "邱比特": { wakeOrder: 2, actionType: "double_select", targetLimit: "雙點", prompt: "選擇兩名玩家成為情侶" },
    "暗戀者": { wakeOrder: 3, actionType: "single_select", targetLimit: "單點", prompt: "選擇你的暗戀對象" },
    "噩夢之影-恐懼": { wakeOrder: 4, actionType: "single_select", targetLimit: "單點", prompt: "選擇你要恐懼的目標" },
    "魔術師": { wakeOrder: 5, actionType: "double_select", targetLimit: "雙點", prompt: "選擇兩名玩家交換位置" },
    "奇蹟商人": { wakeOrder: 6, actionType: "complex_select", targetLimit: "單點", prompt: "選擇技能並贈予幸運兒" },

    // 【夜晚次輪防禦與守護 (順序 7-10)】
    "守衛": { wakeOrder: 7, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的守護目標" },
    "攝夢人": { wakeOrder: 8, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的入夢目標" },
    "幸運兒": { wakeOrder: 9, actionType: "single_select", targetLimit: "單點", prompt: "選擇發動奇蹟商人贈予的技能" },

    // 【狼人陣營共識時間 (順序 11)】
    "狼人": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼王": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "白狼王": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼美人-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "惡靈騎士-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "噩夢之影-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "血月使徒-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "蝕時狼妃-狼刀": { wakeOrder: 11, actionType: "consensus", targetLimit: "共識目標", prompt: "選擇今晚的襲擊目標" },
    "狼鴉之爪-睜眼": { wakeOrder: 11, actionType: "consensus_dynamic", targetLimit: "共識目標(動態)", prompt: "(覺醒後)選擇今晚的襲擊目標" },

    // 【夜晚主動技能角色 (順序 12-21)】
    "狼美人-魅惑": { wakeOrder: 12, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的魅惑目標" },
    "狼鴉之爪-復仇": { wakeOrder: 13, actionType: "single_select_dynamic", targetLimit: "動態單點", prompt: "(覺醒後)選擇今晚的復仇目標" },
    "石像鬼": { wakeOrder: 14, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的觀察目標" },
    "女巫-解藥": { wakeOrder: 15, actionType: "single_select", targetLimit: "單點", prompt: "選擇是否解救襲擊目標x號(x為數字)" },
    "女巫-毒藥": { wakeOrder: 16, actionType: "single_select", targetLimit: "單點", prompt: "選擇你要毒殺的目標" },
    "預言家": { wakeOrder: 17, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的查驗目標" },
    "純白之女": { wakeOrder: 18, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的查驗目標" },
    "獵魔人": { wakeOrder: 19, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的狩獵目標" },
    "守墓人": { wakeOrder: 20, actionType: "none", targetLimit: "無", prompt: "得知昨日出局者的陣營" },
    "烏鴉": { wakeOrder: 21, actionType: "single_select", targetLimit: "單點", prompt: "選擇今晚的詛咒目標" }
};