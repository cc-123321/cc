"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnit = createUnit;
exports.terrainMoveMult = terrainMoveMult;
exports.moveUnit = moveUnit;
exports.applyPush = applyPush;
const MathUtils_1 = require("../core/MathUtils");
function createUnit(id, faction, def, x, z) {
    return {
        id, faction, def,
        x, z, facing: 0,
        hp: def.armor.hp,
        state: 0 /* UnitState.IDLE */,
        cooldown: 0,
        targetId: -1,
        path: [],
        pathIdx: 0,
        pushX: 0, pushZ: 0, pushWeight: 0,
        fuel: def.air ? def.air.fuelTicks : 0,
        dead: false,
        prevX: x, prevZ: z,
    };
}
/** 地形对移动的减速倍率 */
function terrainMoveMult(u, terrain) {
    var _a, _b, _c;
    const { cx, cz } = terrain.cellOf(u.x, u.z);
    const k = terrain.kindAt(cx, cz);
    const slow = u.def.move.terrainSlow;
    switch (k) {
        case 2: return (_a = slow['forest']) !== null && _a !== void 0 ? _a : 1; // FOREST
        case 1: return (_b = slow['hill']) !== null && _b !== void 0 ? _b : 1; // HILL
        case 3: return (_c = slow['river']) !== null && _c !== void 0 ? _c : 1; // RIVER
        default: return 1;
    }
}
/** 朝目标方向移动一步（含转向限制与地形减速），返回新坐标 */
function moveUnit(u, terrain, tx, tz) {
    const def = u.def;
    const mult = terrainMoveMult(u, terrain);
    const step = def.move.speed * mult;
    if (step <= 0)
        return;
    const d = (0, MathUtils_1.dist)(u.x, u.z, tx, tz);
    if (d < 0.01)
        return;
    const targetFacing = Math.atan2(tz - u.z, tx - u.x) * 180 / Math.PI;
    u.facing = (0, MathUtils_1.turnTowardDeg)(u.facing, targetFacing, def.move.turnRateDeg);
    // 转向受限：转向未完时减速，模拟真实转向代价
    const facingDiff = Math.abs(((targetFacing - u.facing + 540) % 360) - 180);
    const facingFactor = 1 - (0, MathUtils_1.clamp)(facingDiff / 180, 0, 1) * 0.55;
    const nx = u.x + Math.cos(targetFacing * Math.PI / 180) * step * facingFactor;
    const nz = u.z + Math.sin(targetFacing * Math.PI / 180) * step * facingFactor;
    // 落点合法性：越界/河流（无桥）禁止进入；轻微滑移
    const { cx, cz } = terrain.cellOf(nx, nz);
    const passable = terrain.isPassable(cx, cz);
    if (passable) {
        u.x = (0, MathUtils_1.clamp)(nx, 0.5, terrain.size - 0.5);
        u.z = (0, MathUtils_1.clamp)(nz, 0.5, terrain.size - 0.5);
    }
    else {
        // 沿边界滑行：尝试只移动一个轴
        const nx2 = u.x + Math.cos(targetFacing * Math.PI / 180) * step * facingFactor;
        if (terrain.isPassable(terrain.cellOf(nx2, u.z).cx, terrain.cellOf(nx2, u.z).cz)) {
            u.x = (0, MathUtils_1.clamp)(nx2, 0.5, terrain.size - 0.5);
        }
        const nz2 = u.z + Math.sin(targetFacing * Math.PI / 180) * step * facingFactor;
        if (terrain.isPassable(terrain.cellOf(u.x, nz2).cx, terrain.cellOf(u.x, nz2).cz)) {
            u.z = (0, MathUtils_1.clamp)(nz2, 0.5, terrain.size - 0.5);
        }
    }
}
/** 推进指令：叠加到目标方向（画线推进的权重实现） */
function applyPush(u, px, pz, weight) {
    u.pushX = px;
    u.pushZ = pz;
    u.pushWeight = Math.max(u.pushWeight, weight);
}
