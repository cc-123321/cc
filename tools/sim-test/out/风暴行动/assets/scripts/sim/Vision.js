"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVision = updateVision;
exports.ceilingLimit = ceilingLimit;
exports.canEngage = canEngage;
function updateVision(units, buildings, difficultyVisionMult, weather) {
    var _a;
    const vision = {
        west: { hasEye: false, visionMult: 1 },
        east: { hasEye: false, visionMult: 1 },
        south: { hasEye: false, visionMult: 1 },
    };
    const weatherMult = (weather === 'fog' || weather === 'sandstorm') ? 0.55 : 1;
    for (const f of ['west', 'east', 'south']) {
        vision[f].visionMult = difficultyVisionMult * weatherMult;
    }
    for (const b of buildings) {
        if (b.dead)
            continue;
        if (b.def.id === 'radar')
            vision[b.faction].hasEye = true;
    }
    for (const u of units) {
        if (u.dead)
            continue;
        if ((_a = u.def.air) === null || _a === void 0 ? void 0 : _a.isAWACS)
            vision[u.faction].hasEye = true;
    }
    return vision;
}
/** 攻击方能否命中空中目标（按升限） */
function ceilingLimit(u) {
    const tags = u.def.tags;
    if (tags.includes('aa'))
        return 1.2; // 防空导弹车：战斗机及以下
    if (u.def.domain === 'ground')
        return 0.3; // 轻武器：低空无人机
    return 0;
}
/** 能否看到并锁定目标（空军需要眼睛；防空需要锁定） */
function canEngage(attacker, vision, targetDomain) {
    if (targetDomain === 'air') {
        // 防空需要雷达锁定
        if (attacker.def.tags.includes('needsLock') || attacker.def.tags.includes('aa')) {
            return vision.hasEye;
        }
        return true;
    }
    // 空军打地面需要眼睛
    if (attacker.def.tags.includes('needsEye')) {
        return vision.hasEye;
    }
    return true;
}
