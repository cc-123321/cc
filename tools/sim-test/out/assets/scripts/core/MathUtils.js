"use strict";
/** 纯函数数学工具（不依赖 cc），供 sim 与 render 共用 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cellToWorld = exports.worldToCell = exports.distToSegment = exports.inSector = exports.dirDeg = exports.dist = exports.dist2 = exports.turnTowardDeg = exports.angleDiffDeg = exports.normAngleDeg = exports.lerp = exports.clamp01 = exports.clamp = void 0;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
exports.clamp = clamp;
const clamp01 = (v) => (0, exports.clamp)(v, 0, 1);
exports.clamp01 = clamp01;
const lerp = (a, b, t) => a + (b - a) * t;
exports.lerp = lerp;
/** 角度（度）归一化到 [-180,180) */
const normAngleDeg = (deg) => {
    let a = deg % 360;
    if (a > 180)
        a -= 360;
    if (a < -180)
        a += 360;
    return a;
};
exports.normAngleDeg = normAngleDeg;
/** 最短角差（度），返回 [-180,180) */
const angleDiffDeg = (from, to) => (0, exports.normAngleDeg)(to - from);
exports.angleDiffDeg = angleDiffDeg;
/** 平滑转向（限制最大角速度，度/tick） */
const turnTowardDeg = (cur, target, maxStepDeg) => {
    const d = (0, exports.angleDiffDeg)(cur, target);
    if (Math.abs(d) <= maxStepDeg)
        return target;
    return (0, exports.normAngleDeg)(cur + Math.sign(d) * maxStepDeg);
};
exports.turnTowardDeg = turnTowardDeg;
const dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
};
exports.dist2 = dist2;
const dist = (ax, az, bx, bz) => Math.sqrt((0, exports.dist2)(ax, az, bx, bz));
exports.dist = dist;
const dirDeg = (fromX, fromZ, toX, toZ) => Math.atan2(toZ - fromZ, toX - fromX) * 180 / Math.PI;
exports.dirDeg = dirDeg;
/** 点是否在扇形内：center 为圆心，facing 为朝向角（度），halfAngle 为半角（度），maxR 为半径 */
const inSector = (cx, cz, facingDeg, halfAngleDeg, maxR, px, pz) => {
    const dx = px - cx, dz = pz - cz;
    const r2 = dx * dx + dz * dz;
    if (r2 > maxR * maxR)
        return false;
    const ang = Math.atan2(dz, dx) * 180 / Math.PI;
    const diff = (0, exports.angleDiffDeg)(facingDeg, ang);
    return Math.abs(diff) <= halfAngleDeg;
};
exports.inSector = inSector;
/** 点到线段的距离（用于河流/路径宽度检测） */
const distToSegment = (px, pz, ax, az, bx, bz) => {
    const abx = bx - ax, abz = bz - az;
    const apx = px - ax, apz = pz - az;
    const len2 = abx * abx + abz * abz;
    if (len2 <= 0)
        return (0, exports.dist)(px, pz, ax, az);
    let t = (apx * abx + apz * abz) / len2;
    t = (0, exports.clamp)(t, 0, 1);
    return (0, exports.dist)(px, pz, ax + abx * t, az + abz * t);
};
exports.distToSegment = distToSegment;
/** 空间哈希：把世界坐标映射到格子（供领土影响累加与邻域查询） */
const worldToCell = (wx, wz, cellSize) => ({
    cx: Math.floor(wx / cellSize),
    cz: Math.floor(wz / cellSize),
});
exports.worldToCell = worldToCell;
/** 网格坐标 → 世界坐标（格中心） */
const cellToWorld = (cx, cz, cellSize) => ({
    x: (cx + 0.5) * cellSize,
    z: (cz + 0.5) * cellSize,
});
exports.cellToWorld = cellToWorld;
