"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.World = void 0;
const Rng_1 = require("../core/Rng");
const MathUtils_1 = require("../core/MathUtils");
const Terrain_1 = require("./Terrain");
const Territory_1 = require("./Territory");
const Unit_1 = require("./Unit");
const Building_1 = require("./Building");
const Projectile_1 = require("./Projectile");
const Combat_1 = require("./Combat");
const Vision_1 = require("./Vision");
const Tactics_1 = require("./Tactics");
const BattleLog_1 = require("./BattleLog");
const Commands_1 = require("./Commands");
const Economy_1 = require("../economy/Economy");
const Pathfind_1 = require("./Pathfind");
const FactionAI_1 = require("../ai/FactionAI");
/**
 * 世界：30Hz 定步长纯数据仿真（不 import 任何 cc 渲染类）。
 * 确定性：固定 seed RNG + 稳定遍历顺序；渲染层只读快照。
 */
const TICKS_PER_SEC = 30;
const TERRITORY_SAMPLE_EVERY = 2; // 15Hz 领土影响采样
const TARGET_RESCAN_EVERY = 15;
const CAPTURE_INFLUENCE = {
    infantry: 0.1, engineer: 0.09, roboDog: 0.08, exo: 0.06,
    assaultCar: 0.045, tank: 0.04, artillery: 0.03, aaVehicle: 0.03,
};
const BUILDING_INFLUENCE = 0.04;
/** 边界自渗：己方边界格每采样向其外侧中立格渗入的进度（地盘自己"涌"） */
const BORDER_CREEP = 0.005;
class World {
    constructor(opts) {
        var _a, _b, _c;
        this.units = [];
        this.buildings = [];
        this.projectiles = [];
        this.tick = 0;
        this.timeSec = 0;
        this.phase = 'deploy';
        this._cmds = new Commands_1.CommandQueue();
        this._factionEffects = {
            west: (0, Tactics_1.createTacticState)(), east: (0, Tactics_1.createTacticState)(), south: (0, Tactics_1.createTacticState)(),
        };
        this._vision = {
            west: { hasEye: false, visionMult: 1 },
            east: { hasEye: false, visionMult: 1 },
            south: { hasEye: false, visionMult: 1 },
        };
        this._factionDead = { west: false, east: false, south: false };
        this._territoryWinTicks = 0;
        this._unitSeq = 0;
        /** 建筑 id 与单位 id 分段，避免 targetId 跨表碰撞指向友方建筑 */
        this._buildSeq = 1000000;
        this._mineCells = [];
        this._factionIdx = { west: 0, east: 1, south: 2 };
        this._factions = ['west', 'east', 'south'];
        this._ewarGlobal = false;
        this._ai = { west: null, east: null, south: null };
        /** 每阵营独立随机流：消除跨阵营 RNG 抽取顺序带来的系统性偏差 */
        this._factionRng = {
            west: new Rng_1.Rng(1), east: new Rng_1.Rng(2), south: new Rng_1.Rng(3),
        };
        this.endReason = null;
        this.winner = null;
        this.rank = [];
        this._stalemate = false;
        this._leader = null;
        /** 调试统计（balance-check 用）：产兵数 / 阵亡数 / 排队失败数 */
        this.debugStats = {
            west: { spawned: 0, deaths: 0, queueFails: 0 },
            east: { spawned: 0, deaths: 0, queueFails: 0 },
            south: { spawned: 0, deaths: 0, queueFails: 0 },
        };
        this.config = opts.config;
        this._externalAI = (_a = opts.externalAI) !== null && _a !== void 0 ? _a : false;
        this.rng = new Rng_1.Rng(opts.seed);
        // 每阵营独立种子（固定偏移，保证可复现）
        this._factionRng = {
            west: new Rng_1.Rng(opts.seed + 7919),
            east: new Rng_1.Rng(opts.seed + 15838),
            south: new Rng_1.Rng(opts.seed + 23757),
        };
        this.weather = (_c = (_b = opts.weather) !== null && _b !== void 0 ? _b : opts.config.map.terrain.weather[0]) !== null && _c !== void 0 ? _c : 'clear';
        this.terrain = new Terrain_1.TerrainData(opts.config.map.terrain);
        this.territory = (0, Territory_1.createTerritory)(this.terrain.size);
        this.economy = new Economy_1.Economy(opts.config.economy);
        this.log = new BattleLog_1.BattleLog();
        // 收集矿点格
        const t = this.terrain;
        for (let cz = 0; cz < t.size; cz++) {
            for (let cx = 0; cx < t.size; cx++) {
                if (t.kindAt(cx, cz) === 5 /* CellKind.MINE */)
                    this._mineCells.push({ cx, cz });
            }
        }
        // 两方 AI（west 由玩家控制）；测试模式三方全部外部驱动
        if (!opts.externalAI) {
            this._ai.east = new FactionAI_1.FactionAI('east');
            this._ai.south = new FactionAI_1.FactionAI('south');
        }
        else {
            this._ai = { west: new FactionAI_1.FactionAI('west'), east: new FactionAI_1.FactionAI('east'), south: new FactionAI_1.FactionAI('south') };
        }
    }
    // ------------------------------------------------------------ 命令接口
    enqueue(cmd) {
        this._cmds.push(cmd);
    }
    startBattle() {
        if (this.phase === 'deploy') {
            this.phase = 'battle';
            // 布阵阶段不推进时间轴：开战即从 0 计时
            this.tick = 0;
            this.timeSec = 0;
        }
    }
    /** 布阵阶段：只处理部署/跳过命令，不推进战斗时间轴与任何战斗系统 */
    deployStep() {
        if (this.phase !== 'deploy')
            return;
        this._applyCommands();
    }
    isFactionAlive(f) {
        return !this._factionDead[f];
    }
    // ------------------------------------------------------------ 初始构造
    placeBuilding(faction, type, x, z) {
        const def = this.config.buildings[type];
        if (!def)
            return null;
        const { cx, cz } = this.terrain.cellOf(x, z);
        if (!this.terrain.isPassable(cx, cz))
            return null;
        const b = (0, Building_1.createBuilding)(++this._buildSeq, faction, def, x, z);
        this.buildings.push(b);
        // 建筑格并入己方领土
        const idx = cz * this.terrain.size + cx;
        const prev = this.territory.owner[idx];
        if (prev !== (0, Territory_1.factionIndex)(faction)) {
            if (prev > 0)
                this.territory.counts[prev - 1]--;
            this.territory.counts[(0, Territory_1.factionIndex)(faction) - 1]++;
        }
        this.territory.owner[idx] = (0, Territory_1.factionIndex)(faction);
        this.territory.progress[idx] = 1;
        (0, Territory_1.refreshBorder)(this.territory);
        this.territory.dirty = true;
        return b;
    }
    deployUnit(faction, unitType, x, z) {
        const def = this.config.units[unitType];
        if (!def)
            return null;
        const u = (0, Unit_1.createUnit)(++this._unitSeq, faction, def, (0, MathUtils_1.clamp)(x, 1, this.terrain.size - 1), (0, MathUtils_1.clamp)(z, 1, this.terrain.size - 1));
        u.state = 0 /* UnitState.IDLE */;
        this.units.push(u);
        this.debugStats[faction].spawned++;
        return u;
    }
    queueUnit(faction, buildingId, unitType) {
        const def = this.config.units[unitType];
        const b = this.buildings.find((bb) => bb.id === buildingId);
        if (!def || !b || b.dead || b.faction !== faction) {
            this.debugStats[faction].queueFails++;
            return false;
        }
        if (!b.def.produces.includes(unitType))
            return false;
        // 兵力上限检查
        const owned = this.territory.counts[this._factionIdx[faction]];
        const cap = this.economy.armyCap(owned);
        const count = this.units.reduce((n, u) => n + (u.faction === faction && !u.dead ? 1 : 0), 0);
        if (count >= cap)
            return false;
        // 成本
        if (b.produceType)
            return false; // 已有一队在生产
        if (!this.economy.spend(faction, def.cost))
            return false;
        b.produceType = unitType;
        b.produceTicks = def.buildTicks;
        return true;
    }
    /** 尝试让建筑开始生产某兵种（成本/上限校验，失败返回 false） */
    _tryStartProduction(b, unitType) {
        const def = this.config.units[unitType];
        if (!def || !b.def.produces.includes(unitType))
            return false;
        if (b.produceType)
            return false;
        const owned = this.territory.counts[this._factionIdx[b.faction]];
        const cap = this.economy.armyCap(owned);
        const count = this.units.reduce((n, u) => n + (u.faction === b.faction && !u.dead ? 1 : 0), 0);
        if (count >= cap)
            return false;
        if (!this.economy.spend(b.faction, def.cost))
            return false;
        b.produceType = unitType;
        b.produceTicks = def.buildTicks;
        return true;
    }
    // ------------------------------------------------------------ 主循环
    step() {
        var _a, _b, _c;
        if (this.phase === 'over')
            return;
        this.tick++;
        this.timeSec = this.tick / TICKS_PER_SEC;
        this._applyCommands();
        if (this.phase === 'battle') {
            this._stepEconomy();
            this._stepVisionAndTactics();
            if (!this._externalAI) {
                (_a = this._ai.east) === null || _a === void 0 ? void 0 : _a.step(this);
                (_b = this._ai.south) === null || _b === void 0 ? void 0 : _b.step(this);
            }
            this._stepBuildings();
            this._stepUnits();
            this._stepProjectiles();
            if (this.tick % TERRITORY_SAMPLE_EVERY === 0)
                this._stepTerritory();
            this._checkEnd();
        }
        // 外部 AI 模式：由调用方驱动全部阵营（测试同节奏）
        if (this._externalAI && this.phase === 'battle') {
            for (const f of this._factions)
                (_c = this._ai[f]) === null || _c === void 0 ? void 0 : _c.step(this);
        }
    }
    // ------------------------------------------------------------ 内部
    _applyCommands() {
        const cmds = this._cmds.drain();
        for (const c of cmds) {
            switch (c.kind) {
                case 'deployUnit':
                    if (this.phase === 'deploy')
                        this.deployUnit(c.faction, c.unitType, c.x, c.z);
                    break;
                case 'queueUnit':
                    this.queueUnit(c.faction, c.buildingId, c.unitType);
                    break;
                case 'autoProduce': {
                    const b = this.buildings.find((bb) => bb.id === c.buildingId);
                    if (b && !b.dead && b.faction === c.faction)
                        b.autoType = c.unitType;
                    break;
                }
                case 'build':
                    this.placeBuilding(c.faction, c.buildingType, c.x, c.z);
                    break;
                case 'rally':
                    this._applyRally(c.faction, c.x, c.z, c.weight);
                    break;
                case 'tactic':
                    this._applyTactic(c);
                    break;
                case 'moveUnit': {
                    const u = this._findUnitById(c.unitId);
                    if (u && u.faction === c.faction) {
                        if (this.phase === 'deploy') {
                            u.x = (0, MathUtils_1.clamp)(c.x, 1, this.terrain.size - 1);
                            u.z = (0, MathUtils_1.clamp)(c.z, 1, this.terrain.size - 1);
                            u.prevX = u.x;
                            u.prevZ = u.z;
                        }
                        else {
                            this._orderMove(u, c.x, c.z);
                        }
                    }
                    break;
                }
                case 'skipDeploy':
                    if (this.phase === 'deploy') {
                        const gain = c.seconds * this.config.economy.deploySkipSupplyPerSec;
                        this.economy.supply[this._factionIdx[c.faction]] += gain;
                    }
                    break;
            }
        }
    }
    _applyRally(faction, x, z, weight) {
        for (const u of this.units) {
            if (u.dead || u.faction !== faction)
                continue;
            const def = u.def;
            if (def.attack.kind === 'none')
                continue; // 工兵/预警机不参与推进
            // 以推进点为基准加散布，避免整队堆在同一格
            const spread = 3.2;
            const s1 = ((u.id % 5) - 2) * spread;
            const s2 = (((u.id >> 2) % 5) - 2) * spread;
            const tx = (0, MathUtils_1.clamp)(x + s1, 1, this.terrain.size - 1);
            const tz = (0, MathUtils_1.clamp)(z + s2, 1, this.terrain.size - 1);
            this._orderMove(u, tx, tz);
        }
    }
    _applyTactic(c) {
        const st = this._factionEffects[c.faction];
        if (!(0, Tactics_1.tryUseTactic)(st, c.tactic))
            return;
        if (c.tactic === 'fortify') {
            // 工兵筑垒：指定位置生成临时工事，扣产能
            const fortCost = 18;
            if (!this.economy.spend(c.faction, fortCost))
                return;
            const def = {
                id: 'fortification', name: '临时工事', hp: Tactics_1.FORTIFY_HP, cost: fortCost, buildTicks: 1,
                produces: [], prodTicksPerUnit: 0, isCore: false, tags: ['fort'],
            };
            const b = (0, Building_1.createBuilding)(++this._buildSeq, c.faction, def, (0, MathUtils_1.clamp)(c.x, 2, this.terrain.size - 2), (0, MathUtils_1.clamp)(c.z, 2, this.terrain.size - 2));
            this.buildings.push(b);
            this.log.record({
                type: "tactic" /* LogType.TACTIC */, faction: c.faction, x: c.x, z: c.z,
                what: '工兵筑起一道临时防线', cause: '使用了战术指令',
                effect: '正面多了一处可依托的掩体', impact: 1,
            }, this.tick);
            return;
        }
        this.log.record({
            type: "tactic" /* LogType.TACTIC */, faction: c.faction, x: c.x, z: c.z,
            what: c.tactic === 'firePrep' ? '炮兵开始火力准备' : '展开电子压制',
            cause: '使用了战术指令',
            effect: c.tactic === 'firePrep' ? '炮火更密，但阵地也暴露了' : '敌我雷达与无人机暂时失灵',
            impact: 1.2,
        }, this.tick);
    }
    _orderMove(u, tx, tz) {
        const path = (0, Pathfind_1.findPath)(this.terrain, u.x, u.z, tx, tz);
        if (path && path.length > 0) {
            u.path = path;
            u.pathIdx = 0;
            u.state = 1 /* UnitState.MOVE */;
        }
    }
    _stepEconomy() {
        this.economy.step(this.territory.owner, this._mineCells, this.terrain.size);
    }
    _stepVisionAndTactics() {
        var _a;
        for (const f of this._factions)
            (0, Tactics_1.tickTactics)(this._factionEffects[f]);
        this._ewarGlobal = this._factions.some((f) => (0, Tactics_1.isEwarActive)(this._factionEffects[f]));
        this._vision = (0, Vision_1.updateVision)(this.units, this.buildings, (_a = this.config.ai.difficultyVisionMult[this.config.ai.difficulty - 1]) !== null && _a !== void 0 ? _a : 1, this.weather);
    }
    _stepBuildings() {
        const ewar = this._ewarGlobal;
        for (const b of this.buildings) {
            if (b.dead)
                continue;
            // 生产
            if (b.produceType && b.produceTicks > 0) {
                b.produceTicks--;
                if (b.produceTicks <= 0) {
                    const u = this.deployUnit(b.faction, b.produceType, b.x, b.z);
                    if (u) {
                        this.log.record({
                            type: "capture" /* LogType.CAPTURE */, faction: b.faction, x: b.x, z: b.z,
                            what: `${b.def.name}产出一支新部队`, cause: '建造队列排产',
                            effect: '前线得到补充', impact: 0.6,
                        }, this.tick);
                    }
                    b.produceType = null;
                }
            }
            // 持续生产：建筑自动连续产兵（玩家只决定兵种编成）
            if (!b.produceType && b.autoType && !b.dead) {
                this._tryStartProduction(b, b.autoType);
            }
            // 防御开火
            const def = b.def.defense;
            if (!def)
                continue;
            if (b.cooldown > 0) {
                b.cooldown--;
                continue;
            }
            if (ewar && def.canHitAir)
                continue; // 电子压制期间防空失能
            const target = this._findBuildingTarget(b, def);
            if (target) {
                this._fireBuilding(b, target);
                b.cooldown = def.reloadTicks;
            }
        }
    }
    _findBuildingTarget(b, def) {
        var _a;
        const vis = this._vision[b.faction];
        let best = null;
        let bestD = def.range;
        for (const u of this.units) {
            if (u.dead || u.faction === b.faction)
                continue;
            const d = (0, MathUtils_1.dist)(b.x, b.z, u.x, u.z);
            if (d < def.minRange || d > def.range)
                continue;
            if (u.def.domain === 'air' && !def.canHitAir)
                continue;
            if (u.def.domain === 'ground' && !def.canHitGround)
                continue;
            if (u.def.domain === 'air' && u.def.air && def.canHitAir && ((_a = u.def.air.ceiling) !== null && _a !== void 0 ? _a : 0) > (def.canHitAir ? 1.2 : 0))
                continue;
            if (!this._seenBy(b.faction, d, vis))
                continue;
            if (def.canHitAir && u.def.domain === 'air' && !(0, Vision_1.canEngage)({ def: { tags: def.canHitAir ? ['aa'] : [] } }, vis, 'air'))
                continue;
            if (d < bestD) {
                bestD = d;
                best = u;
            }
        }
        for (const bb of this.buildings) {
            if (bb.dead || bb.faction === b.faction || bb.def.isCore)
                continue;
            const d = (0, MathUtils_1.dist)(b.x, b.z, bb.x, bb.z);
            if (d < def.minRange || d > def.range || !def.canHitGround)
                continue;
            if (d < bestD) {
                bestD = d;
                best = bb;
            }
        }
        return best;
    }
    _seenBy(faction, d, vis) {
        return d <= 14 * vis.visionMult; // 防御建筑默认视野
    }
    _fireBuilding(b, target) {
        var _a;
        const def = b.def.defense;
        const dmg = (0, Combat_1.resolveShot)(() => this.rng.next(), this.terrain, this.weather, def.damage, 0.8, b.x, b.z, (_a = target.facing) !== null && _a !== void 0 ? _a : 0, target.x, target.z, def.armorMult);
        if (dmg > 0) {
            this._damage(target, dmg, b.faction, b.x, b.z);
        }
    }
    _stepUnits() {
        for (const u of this.units) {
            if (u.dead)
                continue;
            u.prevX = u.x;
            u.prevZ = u.z;
            this._updateUnit(u);
        }
        if (this.tick % 3 === 0)
            this._separateUnits();
    }
    /** 同格堆叠分离：把挤在一起的单位推开（物理：队形散开才有包围与接触面） */
    _separateUnits() {
        const buckets = new Map();
        for (const u of this.units) {
            if (u.dead)
                continue;
            const { cx, cz } = this.terrain.cellOf(u.x, u.z);
            const key = (cx + 4096) | ((cz + 4096) << 14);
            const list = buckets.get(key);
            if (list)
                list.push(u);
            else
                buckets.set(key, [u]);
        }
        const push = 0.35;
        for (const list of buckets.values()) {
            if (list.length < 2)
                continue;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i], b = list[j];
                    if (a.faction !== b.faction)
                        continue;
                    const dx = b.x - a.x, dz = b.z - a.z;
                    const d = Math.hypot(dx, dz);
                    if (d < 1.1 && d > 0.001) {
                        const k = (1.1 - d) / d;
                        const px = dx * k * 0.5, pz = dz * k * 0.5;
                        a.x = (0, MathUtils_1.clamp)(a.x - px, 0.6, this.terrain.size - 0.6);
                        a.z = (0, MathUtils_1.clamp)(a.z - pz, 0.6, this.terrain.size - 0.6);
                        b.x = (0, MathUtils_1.clamp)(b.x + px, 0.6, this.terrain.size - 0.6);
                        b.z = (0, MathUtils_1.clamp)(b.z + pz, 0.6, this.terrain.size - 0.6);
                    }
                }
            }
        }
    }
    _updateUnit(u) {
        var _a, _b;
        const vis = this._vision[u.faction];
        const st = this._factionEffects[u.faction];
        const ewar = this._ewarGlobal;
        const def = u.def;
        const isArtillery = def.attack.kind === 'arc';
        const firePrep = (0, Tactics_1.isFirePrepActive)(st);
        if (u.cooldown > 0)
            u.cooldown--;
        // 空中单位燃油
        if (def.air) {
            u.fuel--;
            if (u.fuel <= 0) {
                const hp = this._homePoint(u.faction);
                this._orderMove(u, hp.x, hp.z);
                if (u.state === 1 /* UnitState.MOVE */)
                    u.fuel = 0;
            }
        }
        // 目标有效性
        let target = u.targetId >= 0 ? (_a = this._findUnitById(u.targetId)) !== null && _a !== void 0 ? _a : this._findBuildingById(u.targetId) : null;
        if (target && target.dead !== undefined && target.dead)
            target = null;
        if (target && target.dead !== undefined && target.dead)
            target = null;
        if (target) {
            const d = (0, MathUtils_1.dist)(u.x, u.z, target.x, target.z);
            const inRange = d <= def.attack.range && d >= def.attack.minRange;
            if (!inRange) {
                target = null;
                u.targetId = -1;
            }
        }
        // 重新索敌
        if (!target && this.tick % TARGET_RESCAN_EVERY === 0) {
            if (!(ewar && (def.tags.includes('aa') || def.domain === 'air'))) {
                target = this._findTarget(u, vis);
                u.targetId = target ? (_b = target.id) !== null && _b !== void 0 ? _b : target.id : -1;
            }
        }
        if (target) {
            u.state = 2 /* UnitState.ATTACK */;
            const tx = target.x, tz = target.z;
            u.facing = Math.atan2(tz - u.z, tx - u.x) * 180 / Math.PI;
            if (u.cooldown <= 0) {
                this._fire(u, target, isArtillery ? (firePrep ? def.attack.reloadTicks / 2 : def.attack.reloadTicks) : def.attack.reloadTicks);
            }
            // 高速单位边打边走
            if (!def.tags.includes('fast'))
                return;
        }
        // 移动：跟随路点或推进方向
        if (u.state !== 2 /* UnitState.ATTACK */ || def.tags.includes('fast')) {
            if (u.pathIdx < u.path.length) {
                const wp = u.path[u.pathIdx];
                const d = (0, MathUtils_1.dist)(u.x, u.z, wp.x, wp.z);
                if (d < 0.9)
                    u.pathIdx++;
                if (u.pathIdx >= u.path.length) {
                    u.state = 0 /* UnitState.IDLE */;
                }
                else {
                    const next = u.path[u.pathIdx];
                    (0, Unit_1.moveUnit)(u, this.terrain, next.x, next.z);
                    u.state = 1 /* UnitState.MOVE */;
                }
            }
            else if (u.state === 0 /* UnitState.IDLE */ && def.attack.kind !== 'none' && this.tick % 20 === 0) {
                // 前沿巡逻：到点后自动向外围中立格推进（地盘"涌"出去、向中心合围）
                const nextNeutral = this._outwardNeutralCell(u);
                if (nextNeutral)
                    this._orderMove(u, nextNeutral.x, nextNeutral.z);
            }
        }
    }
    /** 找"远离老家 + 接近地图中心"的中立格（逐级扩大扫描半径），驱动三方在中心合围 */
    _outwardNeutralCell(u) {
        const n = this.terrain.size;
        const { cx, cz } = this.terrain.cellOf(u.x, u.z);
        const home = this._homePoint(u.faction);
        const center = n * this.terrain.cellSize * 0.5;
        const cs = this.terrain.cellSize;
        for (const radius of [6, 10, 16, 24, 36]) {
            let best = null;
            let bestScore = -Infinity;
            for (let dz = -radius; dz <= radius; dz++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx2 = cx + dx, nz2 = cz + dz;
                    if (nx2 < 0 || nz2 < 0 || nx2 >= n || nz2 >= n)
                        continue;
                    if (dx * dx + dz * dz > radius * radius)
                        continue;
                    const idx = nz2 * n + nx2;
                    if (this.territory.owner[idx] !== 0)
                        continue;
                    if (!this.terrain.isPassable(nx2, nz2))
                        continue;
                    const wx = (nx2 + 0.5) * cs, wz = (nz2 + 0.5) * cs;
                    // 远离老家（向外推）+ 靠近地图中心（合围）双重评分
                    const score = Math.hypot(wx - home.x, wz - home.z) - Math.hypot(wx - center, wz - center) * 1.1;
                    if (score > bestScore) {
                        bestScore = score;
                        best = { x: wx, z: wz };
                    }
                }
            }
            if (best)
                return best;
        }
        return null;
    }
    _findTarget(u, vis) {
        var _a;
        const def = u.def;
        const atk = def.attack;
        if (atk.kind === 'none')
            return null;
        const ewar = this._ewarGlobal;
        const firePrepExposed = (0, Tactics_1.isExposed)(this._factionEffects[u.faction]);
        let best = null;
        let bestD = atk.range;
        for (const e of this.units) {
            if (e.dead || e.faction === u.faction)
                continue;
            const d = (0, MathUtils_1.dist)(u.x, u.z, e.x, e.z);
            if (d < atk.minRange || d > atk.range)
                continue;
            if (e.def.domain === 'air') {
                if (!atk.canHitAir)
                    continue;
                const cl = (0, Vision_1.ceilingLimit)(u);
                if (e.def.air && ((_a = e.def.air.ceiling) !== null && _a !== void 0 ? _a : 0) > cl)
                    continue;
                if (ewar)
                    continue;
                if (!(0, Vision_1.canEngage)(u, vis, 'air'))
                    continue;
            }
            else {
                if (!atk.canHitGround)
                    continue;
                if (ewar && def.domain === 'air')
                    continue;
                if (def.tags.includes('needsEye') && !vis.hasEye)
                    continue;
            }
            if (atk.requiresLineOfSight && !(0, Combat_1.hasLineOfSight)(this.terrain, u.x, u.z, e.x, e.z))
                continue;
            const visRange = def.vision * vis.visionMult * (vis.hasEye ? 1.4 : 1);
            if (d > visRange)
                continue;
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        for (const b of this.buildings) {
            if (b.dead || b.faction === u.faction)
                continue;
            if (!atk.canHitGround)
                continue;
            const d = (0, MathUtils_1.dist)(u.x, u.z, b.x, b.z);
            if (d < atk.minRange || d > atk.range)
                continue;
            if (def.tags.includes('needsEye') && !vis.hasEye)
                continue;
            if (atk.requiresLineOfSight && !(0, Combat_1.hasLineOfSight)(this.terrain, u.x, u.z, b.x, b.z))
                continue;
            const visRange = def.vision * vis.visionMult * (vis.hasEye ? 1.4 : 1);
            if (d > visRange)
                continue;
            if (d < bestD) {
                bestD = d;
                best = b;
            }
        }
        return best;
    }
    _fire(u, target, reload) {
        var _a;
        const atk = u.def.attack;
        u.cooldown = Math.max(1, reload);
        // 近战/无弹道：立即结算
        if (atk.kind === 'melee' || atk.kind === 'none') {
            const dmg = (0, Combat_1.resolveShot)(() => this.rng.next(), this.terrain, this.weather, atk.damage, atk.accuracy, u.x, u.z, (_a = target.facing) !== null && _a !== void 0 ? _a : 0, target.x, target.z, atk.armorMult);
            if (dmg > 0)
                this._damage(target, dmg, u.faction, u.x, u.z);
            return;
        }
        const speed = atk.kind === 'arc' ? 0.5 : 0.95;
        const p = (0, Projectile_1.createProjectile)(u.faction, atk.kind === 'arc' ? 'arc' : atk.kind === 'aa' ? 'aa' : 'direct', u.x, u.z, target.x, target.z, speed, atk.damage, atk.splash, atk.canHitAir, atk.canHitGround, atk.accuracy);
        this.projectiles.push(p);
    }
    _stepProjectiles() {
        const next = [];
        for (const p of this.projectiles) {
            if (p.dead)
                continue;
            p.t++;
            if (p.t >= p.tMax) {
                this._impact(p);
                continue;
            }
            const f = p.t / p.tMax;
            p.x = p.x + (p.targetX - p.x) / (p.tMax - (p.t - 1)) * 1;
            p.z = p.z + (p.targetZ - p.z) / (p.tMax - (p.t - 1)) * 1;
            p.y = p.kind === 'arc' ? Math.max(0, Math.sin(Math.PI * f) * 3.2) : 0.6;
            next.push(p);
        }
        this.projectiles = next;
    }
    _impact(p) {
        var _a;
        if (p.kind === 'arc') {
            // 曲射：落点散布（准度差 → 散布大）
            const scatter = (1 - p.accuracy) * 7;
            const ang = this.rng.next() * Math.PI * 2;
            const ix = p.targetX + Math.cos(ang) * scatter;
            const iz = p.targetZ + Math.sin(ang) * scatter;
            const radius = p.splash;
            for (const u of this.units) {
                if (u.dead || u.faction === p.faction)
                    continue;
                const d = (0, MathUtils_1.dist)(ix, iz, u.x, u.z);
                if (d > radius)
                    continue;
                const falloff = 1 - (d / radius) * 0.55;
                const dmg = Math.round(p.damage * falloff * (0.75 + this.rng.next() * 0.5));
                this._damage(u, dmg, p.faction, ix, iz);
            }
            for (const b of this.buildings) {
                if (b.dead || b.faction === p.faction)
                    continue;
                const d = (0, MathUtils_1.dist)(ix, iz, b.x, b.z);
                if (d > radius * 0.8)
                    continue;
                this._damage(b, Math.round(p.damage * 0.7), p.faction, ix, iz);
            }
        }
        else {
            // 直射/防空：命中瞄准目标（或最近单位）
            let hit = null;
            let hitD = 1.6;
            for (const u of this.units) {
                if (u.dead || u.faction === p.faction)
                    continue;
                const d = (0, MathUtils_1.dist)(p.targetX, p.targetZ, u.x, u.z);
                if (d < hitD) {
                    hitD = d;
                    hit = u;
                }
            }
            if (!hit) {
                for (const b of this.buildings) {
                    if (b.dead || b.faction === p.faction)
                        continue;
                    const d = (0, MathUtils_1.dist)(p.targetX, p.targetZ, b.x, b.z);
                    if (d < hitD) {
                        hitD = d;
                        hit = b;
                    }
                }
            }
            if (hit) {
                const dmg = (0, Combat_1.resolveShot)(() => this.rng.next(), this.terrain, this.weather, p.damage, p.accuracy, p.x, p.z, (_a = hit.facing) !== null && _a !== void 0 ? _a : 0, hit.x, hit.z, { front: 1, flank: 1, rear: 1 });
                if (dmg > 0)
                    this._damage(hit, dmg, p.faction, p.x, p.z);
            }
        }
    }
    _damage(target, dmg, srcFaction, sx, sz) {
        var _a, _b, _c, _d;
        target.hp -= dmg;
        if (target.hp > 0)
            return;
        target.dead = true;
        target.hp = 0;
        const isBuilding = target.def !== undefined && target.def === undefined;
        if (isBuilding) {
            const b = target;
            this.log.record({
                type: b.def.isCore ? "hqHit" /* LogType.HQ_HIT */ : "kill" /* LogType.KILL */,
                faction: b.faction, x: b.x, z: b.z,
                what: `${b.def.name}被摧毁`, cause: '遭到敌方火力打击',
                effect: b.def.isCore ? '指挥部失守，防线崩溃' : '一处防线被撕开',
                impact: b.def.isCore ? -8 : -2,
            }, this.tick);
            if (b.def.isCore) {
                this._factionDead[b.faction] = true;
                this.log.record({
                    type: "hqHit" /* LogType.HQ_HIT */, faction: srcFaction, x: sx, z: sz,
                    what: '敌军指挥部被端掉', cause: '核心建筑被摧毁',
                    effect: '敌方全军瓦解', impact: 6,
                }, this.tick);
            }
        }
        else {
            const u = target;
            const atkName = (_b = (_a = this.config.units[u.def.id]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '部队';
            this.debugStats[u.faction].deaths++;
            this.log.record({
                type: "kill" /* LogType.KILL */, faction: u.faction, x: u.x, z: u.z,
                what: `一队${atkName}被消灭`, cause: '接敌后败下阵来',
                effect: '战线出现空缺', impact: -0.8,
            }, this.tick);
        }
        // 复仇记忆：被谁打的就优先针对谁
        (_d = this._ai[(_c = target.faction) !== null && _c !== void 0 ? _c : target.faction]) === null || _d === void 0 ? void 0 : _d.onAttacked(srcFaction, 0.3);
    }
    _stepTerritory() {
        var _a;
        const samples = [];
        const n = this.terrain.size;
        for (const u of this.units) {
            if (u.dead || u.def.domain === 'air')
                continue;
            const { cx, cz } = this.terrain.cellOf(u.x, u.z);
            if (!this.terrain.inBounds(cx, cz))
                continue;
            const influence = (_a = CAPTURE_INFLUENCE[u.def.id]) !== null && _a !== void 0 ? _a : 0.02;
            samples.push({ cx, cz, fi: (0, Territory_1.factionIndex)(u.faction), influence });
        }
        for (const b of this.buildings) {
            if (b.dead)
                continue;
            const { cx, cz } = this.terrain.cellOf(b.x, b.z);
            if (!this.terrain.inBounds(cx, cz))
                continue;
            samples.push({ cx, cz, fi: (0, Territory_1.factionIndex)(b.faction), influence: BUILDING_INFLUENCE });
        }
        // 边界自渗：己方边界格向外侧中立格缓慢渗入（没有单位也能"涌"）
        const border = this.territory.borderMask;
        for (let cz = 0; cz < n; cz++) {
            for (let cx = 0; cx < n; cx++) {
                const idx = cz * n + cx;
                if (border[idx] !== 1)
                    continue;
                const o = this.territory.owner[idx];
                const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (const [dx, dz] of neighbors) {
                    const nx2 = cx + dx, nz2 = cz + dz;
                    if (nx2 < 0 || nz2 < 0 || nx2 >= n || nz2 >= n)
                        continue;
                    const nIdx = nz2 * n + nx2;
                    if (this.territory.owner[nIdx] !== 0)
                        continue;
                    if (!this.terrain.isPassable(nx2, nz2))
                        continue;
                    samples.push({ cx: nx2, cz: nz2, fi: o, influence: BORDER_CREEP });
                    break; // 每边只渗一个格
                }
            }
        }
        const flipped = (0, Territory_1.stepTerritory)(this.territory, this.terrain, samples);
        if (flipped) {
            const share = (0, Territory_1.territoryShare)(this.territory);
            const playerShare = share[this._factionIdx['west']];
            const swing = this._findBiggestSwing();
            const names = this._factions.map((f) => { var _a, _b; return (_b = (_a = this.config.map.spawns[f]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : f; });
            this.log.record({
                type: "flip" /* LogType.FLIP */, faction: 'west', x: 64, z: 64,
                what: '战线向前推进，新的地块归入我军', cause: '推进部队持续占领',
                effect: swing > 0 ? '产能与接触面同时扩大' : '战线拉长，防守压力增加',
                impact: swing,
            }, this.tick);
            void playerShare;
            void names;
        }
    }
    _findBiggestSwing() {
        // 简化：翻边影响按当前占比变化估算
        const share = (0, Territory_1.territoryShare)(this.territory);
        const p = share[this._factionIdx['west']];
        return Math.round((p - 0.333) * 20);
    }
    _checkEnd() {
        if (this.tick < 900)
            return; // 前 30 秒不判终
        const share = (0, Territory_1.territoryShare)(this.territory);
        const names = this._factions.map((f) => { var _a, _b; return (_b = (_a = this.config.map.spawns[f]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : f; });
        // 指挥中心被毁判负
        const alive = this._factions.filter((f) => !this._factionDead[f]);
        if (alive.length === 1) {
            this._end(alive[0] === 'west' ? '胜利：敌军全线瓦解' : '败北：指挥中心失守', alive[0], names);
            return;
        }
        if (alive.length === 2 && !alive.includes('west')) {
            this._end('败北：我军指挥中心失守', alive[0], names);
            return;
        }
        // 领地占比胜利：控制 45% 并维持 5 秒
        for (const f of this._factions) {
            if (!this._factionDead[f]) {
                const s = share[this._factionIdx[f]];
                if (s >= 0.45) {
                    this._territoryWinTicks++;
                    if (this._territoryWinTicks >= 150) {
                        this._end(f === 'west' ? '胜利：控制了大半个战场' : '败北：敌方吞并了大半战场', f, names);
                        return;
                    }
                }
                else {
                    this._territoryWinTicks = 0;
                }
            }
        }
        // 限时 180 秒按占比定名次；差距过小判僵持
        if (this.timeSec >= 180) {
            const sorted = this._factions.slice().sort((a, b) => share[this._factionIdx[b]] - share[this._factionIdx[a]]);
            const lead = share[this._factionIdx[sorted[0]]];
            const second = share[this._factionIdx[sorted[1]]];
            if (lead - second < 0.02) {
                this._end('僵持：三方均势，战线未分胜负', sorted[0], names, true);
            }
            else {
                const winner = sorted[0];
                this._end(winner === 'west' ? '胜利：占区领先，稳住战线' : '败北：战场已被敌方主导', winner, names);
            }
        }
    }
    /** 结束一局；stalemate=true 表示僵持（winner 仅作领先方标记） */
    _end(reason, winner, names, stalemate = false) {
        this.phase = 'over';
        this.endReason = reason;
        this.winner = stalemate ? null : winner;
        this._stalemate = stalemate;
        this._leader = winner;
        const share = (0, Territory_1.territoryShare)(this.territory);
        this.rank = this._factions.slice().sort((a, b) => share[this._factionIdx[b]] - share[this._factionIdx[a]]);
        void names;
    }
    _homePoint(faction) {
        var _a, _b;
        const s = this.config.map.spawns[faction];
        return { x: (_a = s === null || s === void 0 ? void 0 : s.x) !== null && _a !== void 0 ? _a : 64, z: (_b = s === null || s === void 0 ? void 0 : s.z) !== null && _b !== void 0 ? _b : 64 };
    }
    _findUnitById(id) {
        for (const u of this.units)
            if (u.id === id && !u.dead)
                return u;
        return null;
    }
    _findBuildingById(id) {
        for (const b of this.buildings)
            if (b.id === id && !b.dead)
                return b;
        return null;
    }
    // ------------------------------------------------------------ 快照
    get shares() {
        return (0, Territory_1.territoryShare)(this.territory);
    }
    get supply() {
        return this.economy.supply;
    }
    factionTacticState(f) {
        return this._factionEffects[f];
    }
    factionVision(f) {
        return this._vision[f];
    }
    factionDead(f) {
        return this._factionDead[f];
    }
    isStalemate() {
        return this._stalemate;
    }
    /** 阵营专属随机流（AI 决策/编成使用，避免互相抢同一随机序列） */
    factionRng(f) {
        return this._factionRng[f];
    }
    leader() {
        return this._leader;
    }
    ownedCells(f) {
        return this.territory.counts[this._factionIdx[f]];
    }
}
exports.World = World;
