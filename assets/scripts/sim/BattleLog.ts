import { FactionId } from '../data/ConfigTypes';

/**
 * 因果战报的事件日志：只记录战场事实（谁、在哪、因为什么、导致什么）。
 * 结算时从中筛出 3 张因果卡 —— 不出现任何数字对比。
 */

export const enum LogType {
    CAPTURE = 'capture',
    KILL = 'kill',
    HQ_HIT = 'hqHit',
    TACTIC = 'tactic',
    MINE = 'mine',
    FLIP = 'flip',
    OPPORTUNITY = 'opportunity',
}

export interface LogEvent {
    tick: number;
    type: LogType;
    faction: FactionId;
    x: number;
    z: number;
    /** 人话描述主体 */
    what: string;
    /** 因果：因为什么 */
    cause: string;
    /** 导致什么后果 */
    effect: string;
    /** 影响权重：正=好事，负=坏事（用于筛选三卡） */
    impact: number;
}

export class BattleLog {
    public events: LogEvent[] = [];
    private _seq = 0;

    public record(e: Omit<LogEvent, 'tick'> & { tick?: number }, tick: number): void {
        this.events.push({
            tick: e.tick ?? tick,
            type: e.type, faction: e.faction, x: e.x, z: e.z,
            what: e.what, cause: e.cause, effect: e.effect, impact: e.impact,
        });
        if (this.events.length > 600) this.events.splice(0, 200);
        this._seq++;
    }

    public clear(): void {
        this.events.length = 0;
    }

    /**
     * 生成 3 张因果卡：
     * 1 张"你做对了什么"（正影响最大）、1 张"关键转折"（领地最大摆动）、
     * 1 张"本可以怎么做"（负机会事件，如单位白给）。
     */
    public buildReport(player: FactionId): LogEvent[] {
        const mine = this.events.filter((e) => e.faction === player);
        const best: LogEvent | null = null;
        const good = mine.filter((e) => e.impact > 0).sort((a, b) => b.impact - a.impact);
        const bad = mine.filter((e) => e.impact < 0).sort((a, b) => a.impact - b.impact);
        const swing = this.events
            .filter((e) => e.type === LogType.FLIP || e.type === LogType.CAPTURE)
            .sort((a, b) => b.impact - a.impact);

        const picks: LogEvent[] = [];
        if (good.length > 0) picks.push(good[0]);
        if (swing.length > 0 && !picks.includes(swing[0])) picks.push(swing[0]);
        if (bad.length > 0 && !picks.includes(bad[0])) picks.push(bad[0]);
        // 兜底
        const rest = this.events.filter((e) => !picks.includes(e)).slice(-1);
        while (picks.length < 3 && rest.length > 0) {
            const e = rest.pop()!;
            if (!picks.includes(e)) picks.push(e);
        }
        return picks.slice(0, 3);
    }
}
