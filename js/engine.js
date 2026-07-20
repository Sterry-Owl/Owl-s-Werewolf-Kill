// ==========================================
// v4.0.5 核心引擎 (Event-Driven & OOP Architecture)
// 檔案位置: js/engine.js
// ==========================================
class EventBus {
    constructor() { this.listeners = {}; }
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    emit(event, payload = {}) {
        if (this.listeners[event]) this.listeners[event].forEach(callback => callback(payload));
    }
    clear() { this.listeners = {}; }
}

const GameEvent = new EventBus();

class PlayerModel {
    constructor(seatNumber, peerId, name) {
        this.seatNumber = seatNumber;
        this.peerId = peerId;
        this.name = name;
        this.role = null;
        this.isDead = false;
        this.deathReason = null; 
        this.isRevealed = false;
        this.tags = new Set(); 
        this.data = {};        
    }
    kill(reason, context) {
        if (this.isDead) return false;
        this.isDead = true;
        this.deathReason = reason; 
        GameEvent.emit('PLAYER_DIED', { context: context, player: this, reason: reason });
        return true;
    }
    addTag(tag) { this.tags.add(tag); }
    removeTag(tag) { this.tags.delete(tag); }
    hasTag(tag) { return this.tags.has(tag); }
    clearTags() { this.tags.clear(); }
}

class GameContext {
    constructor() {
        this.players = [];
        this.rules = {};
        this.boardName = "";
        this.phase = "LOBBY";
        this.nightCount = 0;
        this.systemLog = "等待遊戲開始...";
        this.routineOrigin = 'MORNING'; 
        this.deadThisNight = [];
        this.voteHistory = [];
        this.votes = {};
        this.sheriff = { 
            enabled: false, 
            seat: null, 
            badgeLost: false, 
            candidates: [], 
            withdrawn: [], 
            pkTargets: [],           
            explodeDelayCount: 0,    
            tieDelayCount: 0,        
            isDelayedElection: false 
        };
        this.wolfPreviews = {};
        this.pkTargets = []; 
        
        // [新增] 模組化發言佇列狀態
        this.speakingQueue = [];    
        this.currentSpeaker = null; 
        
        this.nightSequence = [];
        this.lastWordsTargets = [];
        this.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
        this.destinationPhase = 'DAY_DISCUSSION'; 
        this.filters = {};
    }
    getNextAliveSeat(startSeat, direction) {
        let current = startSeat;
        const totalSeats = this.players.length;
        for (let i = 0; i < totalSeats; i++) {
            current += direction;
            if (current > totalSeats) current = 1;
            if (current < 1) current = totalSeats;
            const p = this.getPlayer(current);
            if (p && !p.isDead) return current;
        }
        return startSeat; 
    }
    
    // [新增] 抽象化的發言排序演算法 (支援全體順逆序及 PK 特定對象排序)
    buildSpeakingQueue(startSeat, direction, specificTargets = null) {
        this.speakingQueue = [];
        const validSeats = specificTargets || this.players.map(p => p.seatNumber);
        const aliveValidSeats = validSeats.filter(seat => {
            const p = this.getPlayer(seat);
            return p && !p.isDead;
        });
        
        const totalSeats = this.players.length;
        let current = startSeat;
        let attempts = 0; // 防呆計數器，防止極端狀況無窮迴圈

        while (this.speakingQueue.length < aliveValidSeats.length && attempts < totalSeats * 2) {
            attempts++;
            if (aliveValidSeats.includes(current) && !this.speakingQueue.includes(current)) {
                this.speakingQueue.push(current);
            }
            current += direction;
            if (current > totalSeats) current = 1;
            if (current < 1) current = totalSeats;
        }
    }

    // [修改] 斷線重連身分驗證覆寫
    addPlayer(peerId, name) { 
        const existingPlayer = this.players.find(p => p.name === name);
        if (existingPlayer) {
            // 身分吻合，覆寫 peerId，保留原有的狀態與角色資料
            existingPlayer.peerId = peerId;
            return existingPlayer;
        }
        const p = new PlayerModel(this.players.length + 1, peerId, name); 
        this.players.push(p); 
        return p; 
    }
    
    getPlayer(seat) { return this.players.find(p => p.seatNumber === seat); }
    getPlayerByPeer(peerId) { return this.players.find(p => p.peerId === peerId); }
    getAlivePlayers() { return this.players.filter(p => !p.isDead); }
    addFilter(type, fn) { if (!this.filters[type]) this.filters[type] = []; this.filters[type].push(fn); }
    applyFilter(type, initialValue, args = {}) { if (!this.filters[type]) return initialValue; return this.filters[type].reduce((currentValue, fn) => fn(currentValue, args), initialValue); }
}

class StateMachine {
    // ... 保持不變 ...
    constructor(context) { this.ctx = context; this.phases = {}; this.currentPhase = null; this.timer = null; }
    registerPhase(name, phaseLogic) { this.phases[name] = phaseLogic; }
    transitionTo(phaseName, payload = {}) {
        if (this.currentPhase && this.currentPhase.onExit) this.currentPhase.onExit(this.ctx);
        this.clearTimer();
        this.ctx.phase = phaseName;
        this.currentPhase = this.phases[phaseName];
        if (this.currentPhase && this.currentPhase.onEnter) this.currentPhase.onEnter(this.ctx, payload);
        GameEvent.emit('PHASE_CHANGED', { phase: phaseName });
    }
    handleAction(player, actionId, targets) { if (this.currentPhase && this.currentPhase.onAction) this.currentPhase.onAction(this.ctx, player, actionId, targets); }
    setTimer(ms, timeoutCallback) {
        this.clearTimer();
        this.ctx.deadline = Date.now() + ms;
        this.timer = setTimeout(() => {
            this.timer = null;
            if (timeoutCallback) timeoutCallback(this.ctx);
            else if (this.currentPhase && this.currentPhase.onTimeout) this.currentPhase.onTimeout(this.ctx);
        }, ms);
    }
    clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.ctx.deadline = null; }
}

window.Engine = { EventBus: GameEvent, GameContext, PlayerModel, StateMachine };
