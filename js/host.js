// ==========================================
// v4.0.0 網路通訊橋樑與 UI 同步器 (Network & Bridge)
// ==========================================

let hostPeer = null;
let connections = {};
let engineContext = null;
let stateMachine = null;

window.initHost = function(roomId) {
    hostPeer = new Peer(roomId, PEER_CONFIG);
    
    engineContext = new Engine.GameContext();
    stateMachine = new Engine.StateMachine(engineContext);
    
    PhaseRegistry.init(stateMachine, engineContext);
    RoleRegistry.initPassives();
    
    Engine.EventBus.on('SYNC_STATE', syncStateToAll);
    Engine.EventBus.on('PHASE_CHANGED', syncStateToAll);
    Engine.EventBus.on('RESUME_ROUTINE', resumeRoutinePhase); // [修正] 綁定接續流程事件
    Engine.EventBus.on('BROADCAST_MESSAGE', msg => {
        engineContext.players.forEach(p => p.data.tempPrivateMessage = msg);
        syncStateToAll();
    });

    hostPeer.on('open', (id) => {
        document.getElementById('display-room-id').textContent = id;
        syncStateToAll();
    });
    
    hostPeer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        conn.on('data', (data) => handleIncomingPacket(conn.peer, data));
    });
    
    hostPeer.on('error', () => alert('建立房間失敗，可能是房間號碼已被使用。'));
    setupEngineFlowControllers();
};

function handleIncomingPacket(peerId, data) {
    if (data.type === PACKET_TYPE.JOIN_ROOM && engineContext.phase === 'LOBBY') {
        const p = engineContext.addPlayer(peerId, data.payload.name);
        connections[peerId].send({ type: PACKET_TYPE.JOIN_SUCCESS, payload: { seatNumber: p.seatNumber } });
        engineContext.systemLog = `玩家 ${p.name} (${p.seatNumber}號) 已加入。`;
        syncStateToAll();
    }
    else if (data.type === PACKET_TYPE.ACTION_SUBMIT || data.type === PACKET_TYPE.VOTE_SUBMIT) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && !player.isDead) stateMachine.handleAction(player, data.payload.actionId, data.payload.targets);
    }
    else if (data.type === PACKET_TYPE.SHERIFF_BAILOUT && engineContext.phase === 'SHERIFF_SPEECH') {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && engineContext.sheriff.candidates.includes(player.seatNumber)) {
            engineContext.sheriff.candidates = engineContext.sheriff.candidates.filter(s => s !== player.seatNumber);
            engineContext.sheriff.withdrawn.push(player.seatNumber);
            engineContext.systemLog = `【突發事件】${player.seatNumber} 號玩家選擇退水！`;
            syncStateToAll();
        }
    }
    else if (data.type === PACKET_TYPE.WOLF_EXPLODE) {
        Engine.EventBus.emit('WOLF_EXPLODE', { context: engineContext, player: engineContext.getPlayerByPeer(peerId) });
    }
    // [修正] 補上遺失的狼人預覽功能接聽器
    else if (data.type === PACKET_TYPE.WOLF_PREVIEW) {
        const player = engineContext.getPlayerByPeer(peerId);
        if (player && player.role && player.role.includes('狼人') && engineContext.phase === 'NIGHT_ACTION') {
            engineContext.wolfPreviews[peerId] = { seat: player.seatNumber, target: data.payload.target };
            syncStateToAll();
        }
    }
}

/* ... 以下 startGame, setupEngineFlowControllers, resumeRoutinePhase, syncStateToAll 與之前提供的一模一樣 ... */