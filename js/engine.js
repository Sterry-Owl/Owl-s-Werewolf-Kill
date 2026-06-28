// ==========================================
// v4.0.4 核心引擎 (Event-Driven & OOP Architecture)
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
        this.isRevealed = false;
        this.tags = new Set(); 
        this.data = {};        
    }
    kill(reason) {
        if (this.isDead) return false;
        this.isDead = true;
        GameEvent.emit('PLAYER_DIED', { player: this, reason: reason });
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
        
        this.deadThisNight = [];
        this.voteHistory = [];
        this.votes = {};

        // [核心修復] 嚴格初始化所有陣列，徹底根絕 undefined 導致的靜默崩潰！
        this.sheriff = {
            enabled: false,
            seat: null,
            badgeLost: false,
            electionDay: 1,
            candidates: [], // 預設空陣列
            withdrawn: []   // 預設空陣列
        };

        this.wolfPreviews = {};
        this.pkTargets = [];
        this.nightSequence = [];
        this.lastWordsTargets = [];
        this.nightTags = { killed: [], poisoned: [], witchUsedSaveTonight: false };
        this.destinationPhase = 'DAY_DISCUSSION';

        this.filters = {};
    }

    addPlayer(peerId, name) {
        const p = new PlayerModel(this.players.length + 1, peerId, name);
        this.players.push(p);
        return p;
    }

    getPlayer(seat) { return this.players.find(p => p.seatNumber === seat); }
    getPlayerByPeer(peerId) { return this.players.find(p => p.peerId === peerId); }
    getAlivePlayers() { return this.players.filter(p => !p.isDead); }

    addFilter(type, fn) {
        if (!this.filters[type]) this.filters[type] = [];
        this.filters[type].push(fn);
    }

    applyFilter(type, initialValue, args = {}) {
        if (!this.filters[type]) return initialValue;
        return this.filters[type].reduce((currentValue, fn) => fn(currentValue, args), initialValue);
    }
}

class StateMachine {
    constructor(context) {
        this.ctx = context;
        this.phases = {};
        this.currentPhase = null;
        this.timer = null;
    }
    registerPhase(name, phaseLogic) { this.phases[name] = phaseLogic; }
    transitionTo(phaseName, payload = {}) {
        if (this.currentPhase && this.currentPhase.onExit) this.currentPhase.onExit(this.ctx);
        this.clearTimer();
        this.ctx.phase = phaseName;
        this.currentPhase = this.phases[phaseName];
        if (this.currentPhase && this.currentPhase.onEnter) this.currentPhase.onEnter(this.ctx, payload);
        GameEvent.emit('PHASE_CHANGED', { phase: phaseName });
    }
    handleAction(player, actionId, targets) {
        if (this.currentPhase && this.currentPhase.onAction) this.currentPhase.onAction(this.ctx, player, actionId, targets);
    }
    setTimer(ms, timeoutCallback) {
        this.clearTimer();
        this.ctx.deadline = Date.now() + ms;
        this.timer = setTimeout(() => {
            this.timer = null;
            if (timeoutCallback) timeoutCallback(this.ctx);
            else if (this.currentPhase && this.currentPhase.onTimeout) this.currentPhase.onTimeout(this.ctx);
        }, ms);
    }
    clearTimer() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.ctx.deadline = null;
    }
}

window.Engine = { EventBus: GameEvent, GameContext, PlayerModel, StateMachine };