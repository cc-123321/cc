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
        this.faction = faction;
        this._diplomacy = (0, Diplomacy_1.createDiplomacy)();
    }
    step(world) {
        var _a;
        this._tick++;
        const aiDef = world.config.ai;
        const interval = (_a = aiDef.difficultyDecideTicks[aiDef.difficulty - 1]) !== null && _a !== void 0 ? _a : 45;
        if (this._tick % interval !== 0)
            return;
        if (!world.isFactionAlive(this.faction))
            return;
        (0, Diplomacy_1.updateDiplomacy)(world, this._diplomacy, aiDef.coalitionThreshold);
        (0, Diplomacy_1.decayGrudges)(this._diplomacy, aiDef.grudgeDecay);
        const target = this._decide(world);
        if (target) {
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
        for (const m of (_a = world['_mineCells']) !== null && _a !== void 0 ? _a : []) {
            const wpt = mine.worldOf(m.cx, m.cz);
            const o = world.territory.owner[m.cz * mine.size + m.cx];
            if (o === (0, Territory_1.factionIndex)(me))
                continue;
            const d = (0, MathUtils_1.dist)(me === 'west' ? 20 : 108, me === 'west' ? 16 : 108, wpt.x, wpt.z);
            if (d < bestMineD) {
                bestMineD = d;
                bestMine = wpt;
            }
        }
        // 扩张：推进到最近的边界格方向
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
        const t = world.territory;
        const n = t.size;
        let best = null;
        let bestD = Infinity;
        for (let cz = 0; cz < n; cz++) {
            for (let cx = 0; cx < n; cx++) {
                const o = world.territory.owner[cz * n + cx];
                if (o !== me)
                    continue;
                // 找己方边界格
                let isBorder = false;
                if (cx > 0 && world.territory.owner[cz * n + cx - 1] !== me)
                    isBorder = true;
                else if (cx < n - 1 && world.territory.owner[cz * n + cx + 1] !== me)
                    isBorder = true;
                else if (cz > 0 && world.territory.owner[(cz - 1) * n + cx] !== me)
                    isBorder = true;
                else if (cz < n - 1 && world.territory.owner[(cz + 1) * n + cx] !== me)
                    isBorder = true;
                if (!isBorder)
                    continue;
                const home = this._homePoint(world);
                const cs = world.terrain.cellSize;
                const d = (0, MathUtils_1.dist)(home.x, home.z, (cx + 0.5) * cs, (cz + 0.5) * cs);
                if (d < bestD) {
                    bestD = d;
                    best = { x: (cx + 0.5) * cs, z: (cz + 0.5) * cs };
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
        const me = this.faction;
        const owned = world.ownedCells(me);
        const cap = world.economy.armyCap(owned);
        const count = world.units.reduce((n, u) => n + (u.faction === me && !u.dead ? 1 : 0), 0);
        if (count >= cap)
            return;
        // 找空闲产兵建筑，排一队
        const producer = world.buildings.find((b) => b.faction === me && !b.dead && b.def.produces.length > 0 && !b.produceType);
        if (!producer)
            return;
        const affordable = world.config.units;
        const candidates = producer.def.produces.filter((t) => { var _a, _b; return world.economy.canAfford(me, (_b = (_a = affordable[t]) === null || _a === void 0 ? void 0 : _a.cost) !== null && _b !== void 0 ? _b : 999); });
        if (candidates.length === 0)
            return;
        // 优先补步兵/坦克，缺空优则补防空
        let pick = candidates[0];
        if (candidates.includes('infantry'))
            pick = 'infantry';
        if (world['_mineCells'] && candidates.includes('tank') && world.territory.counts[(0, Territory_1.factionIndex)(me) - 1] > 40)
            pick = 'tank';
        world.enqueue({ kind: 'queueUnit', faction: me, buildingId: producer.id, unitType: pick });
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
