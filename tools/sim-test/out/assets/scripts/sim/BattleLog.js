"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleLog = void 0;
class BattleLog {
    constructor() {
        this.events = [];
        this._seq = 0;
    }
    record(e, tick) {
        var _a;
        this.events.push({
            tick: (_a = e.tick) !== null && _a !== void 0 ? _a : tick,
            type: e.type, faction: e.faction, x: e.x, z: e.z,
            what: e.what, cause: e.cause, effect: e.effect, impact: e.impact,
        });
        if (this.events.length > 600)
            this.events.splice(0, 200);
        this._seq++;
    }
    clear() {
        this.events.length = 0;
    }
    /**
     * 生成 3 张因果卡：
     * 1 张"你做对了什么"（正影响最大）、1 张"关键转折"（领地最大摆动）、
     * 1 张"本可以怎么做"（负机会事件，如单位白给）。
     */
    buildReport(player) {
        const mine = this.events.filter((e) => e.faction === player);
        const best = null;
        const good = mine.filter((e) => e.impact > 0).sort((a, b) => b.impact - a.impact);
        const bad = mine.filter((e) => e.impact < 0).sort((a, b) => a.impact - b.impact);
        const swing = this.events
            .filter((e) => e.type === "flip" /* LogType.FLIP */ || e.type === "capture" /* LogType.CAPTURE */)
            .sort((a, b) => b.impact - a.impact);
        const picks = [];
        if (good.length > 0)
            picks.push(good[0]);
        if (swing.length > 0 && !picks.includes(swing[0]))
            picks.push(swing[0]);
        if (bad.length > 0 && !picks.includes(bad[0]))
            picks.push(bad[0]);
        // 兜底
        const rest = this.events.filter((e) => !picks.includes(e)).slice(-1);
        while (picks.length < 3 && rest.length > 0) {
            const e = rest.pop();
            if (!picks.includes(e))
                picks.push(e);
        }
        return picks.slice(0, 3);
    }
}
exports.BattleLog = BattleLog;
