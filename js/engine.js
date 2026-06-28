// ==========================================
// v4.0.0 核心引擎 (Event-Driven & OOP Architecture)
// ==========================================

class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, payload = {}) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(payload));
        }
    }

    clear() {
        this.listeners = {};
    }
}

// 建立全域的遊戲事件中心
const GameEvent = new EventBus();

class PlayerModel {
    constructor(seatNumber, peerId, name) {
        this.seatNumber = seatNumber;
        this.peerId = peerId;
        this.name = name;
        this.role = null;
        this.isDead = false;
        this.isRevealed = false;
        this.tags = new Set(); // 存放如 'poisoned', 'saved', 'candidate' 等動態標籤
        this.data = {};        // 存放角色專屬資料，例如預言家的查驗紀錄
    }

    kill(reason) {
        if (this.isDead) return false;
        this.isDead = true;
        // 死亡時自動發出事件，獵人或警長模組會自己聽到這個聲音
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

        // 警長資料區塊
        this.sheriff = {
            enabled: false,
            seat: null,
            badgeLost: false,
            electionDay: 1
        };

        // 過濾器系統 (Filter System) - 用於計算 1.5 票等動態權重
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

    // --- 過濾器機制 ---
    addFilter(type, fn) {
        if (!this.filters[type]) this.filters[type] = [];
        this.filters[type].push(fn);
    }

    applyFilter(type, initialValue, args = {}) {
        if (!this.filters[type]) return initialValue;
        return this.filters[type].reduce((currentValue, fn) => fn(currentValue, args), initialValue);
    }
}

/**
 * 4. 狀態機控制器 (State Machine)
 * 管理各個階段的生命週期 (onEnter, onAction, onTimeout, onExit)
 */
class StateMachine {
    constructor(context) {
        this.ctx = context;
        this.phases = {};
        this.currentPhase = null;
        this.timer = null;
    }

    registerPhase(name, phaseLogic) {
        this.phases[name] = phaseLogic;
    }

    transitionTo(phaseName, payload = {}) {
        if (this.currentPhase && this.currentPhase.onExit) {
            this.currentPhase.onExit(this.ctx);
        }
        
        this.clearTimer();
        this.ctx.phase = phaseName;
        this.currentPhase = this.phases[phaseName];
        
        if (this.currentPhase && this.currentPhase.onEnter) {
            this.currentPhase.onEnter(this.ctx, payload);
        }
        
        // 通知外部系統狀態已改變 (例如觸發 UI 同步)
        GameEvent.emit('PHASE_CHANGED', { phase: phaseName });
    }

    handleAction(player, actionId, targets) {
        if (this.currentPhase && this.currentPhase.onAction) {
            this.currentPhase.onAction(this.ctx, player, actionId, targets);
        }
    }

    setTimer(ms, timeoutCallback) {
        this.clearTimer();
        this.ctx.deadline = Date.now() + ms;
        this.timer = setTimeout(() => {
            this.timer = null;
            if (timeoutCallback) timeoutCallback(this.ctx);
            else if (this.currentPhase && this.currentPhase.onTimeout) {
                this.currentPhase.onTimeout(this.ctx);
            }
        }, ms);
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.ctx.deadline = null;
    }
}

// 導出供其他模組使用
window.Engine = {
    EventBus: GameEvent,
    GameContext,
    PlayerModel,
    StateMachine
};