"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectile = createProjectile;
let projectileSeq = 0;
function createProjectile(faction, kind, sx, sz, tx, tz, speed, damage, splash, canHitAir, canHitGround, accuracy) {
    const d = Math.sqrt((tx - sx) ** 2 + (tz - sz) ** 2);
    const tMax = Math.max(1, d / Math.max(0.1, speed));
    return {
        id: ++projectileSeq,
        faction, kind,
        x: sx, z: sz, y: 0.6,
        targetX: tx, targetZ: tz,
        speed,
        damage, splash, canHitAir, canHitGround, accuracy,
        t: 0, tMax, dead: false,
    };
}
