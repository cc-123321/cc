"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FactionAI = void 0;
const Territory_1 = require("../sim/Territory");
const MathUtils_1 = require("../core/MathUtils");
const Diplomacy_1 = require("./Diplomacy");
/**
 * 三方 Utility AI：按效用评分决定 扩张/固守/偷袭/抢矿/报复。
 * 难度只调决策频率与视野（不调兵力数值）。
 */
const ACTIONS = ['expand', 'defend', 'raid', 'contestMine', 'revenge'];
class FactionAI {
    constructor(faction) {
        this._tick = 0;
        this._target = null;
        this._targetHoldTicks = 0;
        this.faction = faction;
        this._diplomacy = (0, Diplomacy_1.createDiplomacy)();
    }
    step(world) {
        var _a;
        this._tick++;
        this._targetHoldTicks++;
        const aiDef = world.config.ai;
        const interval = (_a = aiDef.difficultyDecideTicks[aiDef.difficulty - 1]) !== null && _a !== void 0 ? _a : 45;
        if (this._tick % interval !== 0)
            return;
        if (!world.isFactionAlive(this.faction))
            return;
        (0, Diplomacy_1.updateDiplomacy)(world, this._diplomacy, aiDef.coalitionThreshold);
        (0, Diplomacy_1.decayGrudges)(this._diplomacy, aiDef.grudgeDecay);
        const target = this._decide(world);
        // 目标粘性：目标变化不大或未超保持期则沿用，避免部队来回摇摆
        const moved = this._target && target
            ? Math.hypot(target.x - this._target.x, target.z - this._target.z) : Infinity;
        if (target && (this._targetHoldTicks > 240 || !this._target || moved > 10)) {
            this._target = target;
            this._targetHoldTicks = 0;
            world.enqueue({ kind: 'rally', faction: this.faction, x: target.x, z: target.z, weight: 1 });
        }
        this._manageProduction(world);
        this._maybeUseTactics(world);
    }
    /** 被谁打了（外部由 World 在击杀事件时调用） */
    onAttacked(attacker, amount) {
        if (attacker === this.faction)
            return;
        this._diplomacy.grudges[this.faction][attacker] = Math.min(1, this._diplomacy.grudges[this.faction][attacker] + amount);
    }
    coalitionTarget() {
        return this._diplomacy.coalitionTarget;
    }
    // ------------------------------------------------------------------
    _decide(world) {
        var _a;
        const w = world.config.ai.weights;
        const me = this.faction;
        const share = (0, Territory_1.territoryShare)(world.territory);
        const myShare = share[(0, Territory_1.factionIndex)(me) - 1];
        const myUnits = world.units.filter((u) => u.faction === me && !u.dead);
        const myBuildings = world.buildings.filter((b) => b.faction === me && !b.dead);
        const myStrength = myUnits.length + myBuildings.length;
        // 反滚雪球：联合针对领头者
        const coalition = this._diplomacy.coalitionTarget;
        if (coalition && coalition !== me) {
            const hq = world.buildings.find((b) => b.faction === coalition && !b.dead && b.def.isCore);
            if (hq) {
                return { x: hq.x, z: hq.z };
            }
        }
        // 复仇记忆
        const grudgeTarget = this._maxGrudge();
        if (grudgeTarget) {
            const enemy = world.buildings.find((b) => b.faction === grudgeTarget && !b.dead && b.def.isCore);
            if (enemy)
                return { x: enemy.x, z: enemy.z };
        }
        // 抢矿：最近的未占领/敌方矿点
        const mine = world.terrain;
        let bestMine = null;
        let bestMineD = Infinity;
        const home = this._homePoint(world);
        for (const m of (_a = world['_mineCells']) !== null && _a !== void 0 ? _a : []) {
            const wpt = mine.worldOf(m.cx, m.cz);
            const o = world.territory.owner[m.cz * mine.size + m.cx];
            if (o === (0, Territory_1.factionIndex)(me))
                continue;
            const d = (0, MathUtils_1.dist)(home.x, home.z, wpt.x, wpt.z);
            if (d < bestMineD) {
                bestMineD = d;
                bestMine = wpt;
            }
        }
        // 扩张：推进到最近的边界外侧中立格
        const frontier = this._nearestFrontier(world);
        const enemyHq = this._nearestEnemyHq(world);
        const enemyNearHome = this._enemyNearHome(world);
        const scores = {
            expand: w.expand * (1 - myShare * 1.6) * (frontier ? 1 : 0.2),
            defend: w.defend * enemyNearHome,
            raid: w.raid * (enemyHq ? (myStrength > 4 ? 1 : 0.3) : 0),
            contestMine: w.contestMine * (bestMine ? 1 : 0),
            revenge: w.revenge * (grudgeTarget ? this._diplomacy.grudges[me][grudgeTarget] : 0),
        };
        let bestAction = 'expand';
        let bestScore = -Infinity;
        for (const a of ACTIONS) {
            if (scores[a] > bestScore) {
                bestScore = scores[a];
                bestAction = a;
            }
        }
        switch (bestAction) {
            case 'raid': return enemyHq;
            case 'contestMine': return bestMine;
            case 'defend': return this._homePoint(world);
            case 'revenge': {
                if (grudgeTarget) {
                    const hq = world.buildings.find((b) => b.faction === grudgeTarget && !b.dead && b.def.isCore);
                    if (hq)
                        return { x: hq.x, z: hq.z };
                }
                return frontier !== null && frontier !== void 0 ? frontier : this._homePoint(world);
            }
            case 'expand':
            default:
                return frontier !== null && frontier !== void 0 ? frontier : this._homePoint(world);
        }
    }
    _nearestFrontier(world) {
        const me = (0, Territory_1.factionIndex)(this.faction);
        const n = world.terrain.size;
        const cs = world.terrain.cellSize;
        const home = this._homePoint(world);
        const center = n * cs * 0.5;
        let best = null;
        let bestScore = -Infinity;
        for (let cz = 0; cz < n; cz++) {
            for (let cx = 0; cx < n; cx++) {
                const o = world.territory.owner[cz * n + cx];
                if (o !== me)
                    continue;
                const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (const [dx, dz] of neighbors) {
                    const nx2 = cx + dx, nz2 = cz + dz;
                    if (nx2 < 0 || nz2 < 0 || nx2 >= n || nz2 >= n)
                        continue;
                    const no = world.territory.owner[nz2 * n + nx2];
                    if (no === me)
                        continue;
                    if (!world.terrain.isPassable(nx2, nz2))
                        continue;
                    const wx = (nx2 + 0.5) * cs, wz = (nz2 + 0.5) * cs;
                    // 与巡逻一致：远离老家 + 靠近中心（三方在中心合围）
                    const score = Math.hypot(wx - home.x, wz - home.z) - Math.hypot(wx - center, wz - center) * 1.1;
                    if (score > bestScore) {
                        bestScore = score;
                        best = { x: wx, z: wz };
                    }
                }
            }
        }
        return best;
    }
    _nearestEnemyHq(world) {
        let best = null;
        let bestD = Infinity;
        for (const b of world.buildings) {
            if (b.dead || b.faction === this.faction || !b.def.isCore)
                continue;
            const home = this._homePoint(world);
            const d = (0, MathUtils_1.dist)(home.x, home.z, b.x, b.z);
            if (d < bestD) {
                bestD = d;
                best = { x: b.x, z: b.z };
            }
        }
        return best;
    }
    _enemyNearHome(world) {
        const home = this._homePoint(world);
        let threat = 0;
        for (const u of world.units) {
            if (u.dead || u.faction === this.faction)
                continue;
            const d = (0, MathUtils_1.dist)(home.x, home.z, u.x, u.z);
            if (d < 26)
                threat += 0.4;
        }
        return Math.min(1, threat);
    }
    _maxGrudge() {
        const g = this._diplomacy.grudges[this.faction];
        let best = null;
        let bestV = 0.2; // 阈值：记仇超过 0.2 才生效
        for (const f of ['west', 'east', 'south']) {
            if (f === this.faction)
                continue;
            if (g[f] > bestV) {
                bestV = g[f];
                best = f;
            }
        }
        return best;
    }
    _homePoint(world) {
        var _a, _b;
        const s = world.config.map.spawns[this.faction];
        return { x: (_a = s === null || s === void 0 ? void 0 : s.x) !== null && _a !== void 0 ? _a : 64, z: (_b = s === null || s === void 0 ? void 0 : s.z) !== null && _b !== void 0 ? _b : 64 };
    }
    _manageProduction(world) {
        var _a, _b, _c;
        const me = this.faction;
        const owned = world.ownedCells(me);
        const cap = world.economy.armyCap(owned);
        const count = world.units.reduce((n, u) => n + (u.faction === me && !u.dead ? 1 : 0), 0);
        if (count >= cap)
            return;
        // 编成策略：按比例混编（步兵主体 + 坦克/炮兵/突击车穿插）
        const roll = world.factionRng(me).next();
        let want;
        let producerType = 'barracks';
        if (roll < 0.45)
            want = 'infantry';
        else if (roll < 0.68) {
            want = 'tank';
            producerType = 'factory';
        }
        else if (roll < 0.82) {
            want = 'artillery';
            producerType = 'factory';
        }
        else {
            want = 'assaultCar';
            producerType = 'factory';
        }
        // 找能产出该兵种且空闲的产兵建筑
        const producers = world.buildings.filter((b) => b.faction === me && !b.dead && b.def.produces.includes(want) && !b.produceType);
        if (producers.length === 0)
            return;
        const producer = (_a = producers.find((b) => b.def.id === producerType)) !== null && _a !== void 0 ? _a : producers[0];
        if (!world.economy.canAfford(me, (_c = (_b = world.config.units[want]) === null || _b === void 0 ? void 0 : _b.cost) !== null && _c !== void 0 ? _c : 999))
            return;
        world.enqueue({ kind: 'queueUnit', faction: me, buildingId: producer.id, unitType: want });
    }
    _maybeUseTactics(world) {
        const st = world.factionTacticState(this.faction);
        const share = (0, Territory_1.territoryShare)(world.territory)[(0, Territory_1.factionIndex)(this.faction) - 1];
        if (st.cooldown[2] === 0 && share > 0.2 && this._tick % 3 === 0) {
            world.enqueue({ kind: 'tactic', faction: this.faction, tactic: "fortify" /* TacticId.FORTIFY */, x: 64, z: 64 });
        }
    }
}
exports.FactionAI = FactionAI;
