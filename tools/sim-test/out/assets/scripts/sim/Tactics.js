"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORTIFY_HP = exports.EWAR_DURATION = exports.FIRE_PREP_DURATION = exports.TACTIC_COOLDOWN_TICKS = exports.TACTIC_IDS = void 0;
exports.createTacticState = createTacticState;
exports.tickTactics = tickTactics;
exports.tryUseTactic = tryUseTactic;
exports.isFirePrepActive = isFirePrepActive;
exports.isEwarActive = isEwarActive;
exports.isExposed = isExposed;
exports.TACTIC_IDS = ["firePrep" /* TacticId.FIRE_PREP */, "ewar" /* TacticId.EWAR */, "fortify" /* TacticId.FORTIFY */];
exports.TACTIC_COOLDOWN_TICKS = 240; // 8 秒冷却
exports.FIRE_PREP_DURATION = 90; // 3 秒
exports.EWAR_DURATION = 60; // 2 秒
exports.FORTIFY_HP = 80;
function createTacticState() {
    return { cooldown: [0, 0, 0], firePrepUntil: 0, ewarUntil: 0, exposedUntil: 0 };
}
function tickTactics(t) {
    for (let i = 0; i < 3; i++)
        if (t.cooldown[i] > 0)
            t.cooldown[i]--;
    if (t.firePrepUntil > 0)
        t.firePrepUntil--;
    if (t.ewarUntil > 0)
        t.ewarUntil--;
    if (t.exposedUntil > 0)
        t.exposedUntil--;
}
/** 尝试触发战术；返回是否成功（冷却中则失败） */
function tryUseTactic(t, tactic) {
    const idx = exports.TACTIC_IDS.indexOf(tactic);
    if (idx < 0 || t.cooldown[idx] > 0)
        return false;
    t.cooldown[idx] = exports.TACTIC_COOLDOWN_TICKS;
    switch (tactic) {
        case "firePrep" /* TacticId.FIRE_PREP */:
            t.firePrepUntil = exports.FIRE_PREP_DURATION;
            t.exposedUntil = exports.FIRE_PREP_DURATION; // 对称代价：阵地暴露
            break;
        case "ewar" /* TacticId.EWAR */:
            t.ewarUntil = exports.EWAR_DURATION; // 对称代价：己方同样失去雷达视野
            break;
        case "fortify" /* TacticId.FORTIFY */:
            break; // 代价在 World 中扣产能并暴露工兵
    }
    return true;
}
/** 火力准备效果：炮 reload 减半 */
function isFirePrepActive(t) {
    return t.firePrepUntil > 0;
}
/** 电子压制效果：全局雷达/无人机/防空锁定失效 */
function isEwarActive(t) {
    return t.ewarUntil > 0;
}
function isExposed(t) {
    return t.exposedUntil > 0;
}
