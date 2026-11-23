/** 纯函数数学工具（不依赖 cc），供 sim 与 render 共用 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 角度（度）归一化到 [-180,180) */
export const normAngleDeg = (deg: number): number => {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
};

/** 最短角差（度），返回 [-180,180) */
export const angleDiffDeg = (from: number, to: number): number => normAngleDeg(to - from);

/** 平滑转向（限制最大角速度，度/tick） */
export const turnTowardDeg = (cur: number, target: number, maxStepDeg: number): number => {
    const d = angleDiffDeg(cur, target);
    if (Math.abs(d) <= maxStepDeg) return target;
    return normAngleDeg(cur + Math.sign(d) * maxStepDeg);
};

export interface Vec2Like { x: number; y: number; }
export interface Vec2 { x: number; y: number; }

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
};

export const dist = (ax: number, az: number, bx: number, bz: number): number => Math.sqrt(dist2(ax, az, bx, bz));

export const dirDeg = (fromX: number, fromZ: number, toX: number, toZ: number): number =>
    Math.atan2(toZ - fromZ, toX - fromX) * 180 / Math.PI;

/** 点是否在扇形内：center 为圆心，facing 为朝向角（度），halfAngle 为半角（度），maxR 为半径 */
export const inSector = (
    cx: number, cz: number, facingDeg: number, halfAngleDeg: number, maxR: number,
    px: number, pz: number,
): boolean => {
    const dx = px - cx, dz = pz - cz;
    const r2 = dx * dx + dz * dz;
    if (r2 > maxR * maxR) return false;
    const ang = Math.atan2(dz, dx) * 180 / Math.PI;
    const diff = angleDiffDeg(facingDeg, ang);
    return Math.abs(diff) <= halfAngleDeg;
};

/** 点到线段的距离（用于河流/路径宽度检测） */
export const distToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const abx = bx - ax, abz = bz - az;
    const apx = px - ax, apz = pz - az;
    const len2 = abx * abx + abz * abz;
    if (len2 <= 0) return dist(px, pz, ax, az);
    let t = (apx * abx + apz * abz) / len2;
    t = clamp(t, 0, 1);
    return dist(px, pz, ax + abx * t, az + abz * t);
};

/** 空间哈希：把世界坐标映射到格子（供领土影响累加与邻域查询） */
export const worldToCell = (wx: number, wz: number, cellSize: number): { cx: number; cz: number } => ({
    cx: Math.floor(wx / cellSize),
    cz: Math.floor(wz / cellSize),
});

/** 网格坐标 → 世界坐标（格中心） */
export const cellToWorld = (cx: number, cz: number, cellSize: number): { x: number; z: number } => ({
    x: (cx + 0.5) * cellSize,
    z: (cz + 0.5) * cellSize,
});
