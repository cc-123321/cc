import { IPlatform, AdScene } from './IPlatform';

/**
 * 广告频控（硬规则落在代码里）：
 * - 战中一律拒绝（battleLock）
 * - 单局激励 ≤ 2 次；单日上限；最小间隔
 * - 插屏仅局间、间隔 ≥ 90s、单日 ≤ 6 次
 * - 所有入口都必须有免费替代路径（由 UI 保证）
 */

interface SlotRule {
    perMatch: number;
    perDay: number;
    minIntervalMs: number;
}

const RULES: Record<string, SlotRule> = {
    doubleMerit: { perMatch: 1, perDay: 3, minIntervalMs: 30000 },
    revive: { perMatch: 1, perDay: 3, minIntervalMs: 30000 },
    speedUp: { perMatch: 1, perDay: 6, minIntervalMs: 30000 },
    supply: { perMatch: 0, perDay: 2, minIntervalMs: 60000 },
    interstitial: { perMatch: 1, perDay: 6, minIntervalMs: 90000 },
};

export class AdService {
    private _platform: IPlatform;
    private _battleActive = false;
    private _matchCounts: Record<string, number> = {};
    private _lastShowAt: Record<string, number> = {};
    private _dayKey: string;
    private _dayCounts: Record<string, number> = {};

    public constructor(platform: IPlatform) {
        this._platform = platform;
        this._dayKey = this._today();
        this._dayCounts = this._loadDay();
    }

    /** 战斗开始/结束：战中拒绝一切广告 */
    public setBattleActive(active: boolean): void {
        this._battleActive = active;
        if (active) this._matchCounts = {};
    }

    public get battleActive(): boolean {
        return this._battleActive;
    }

    public canShow(slot: string): boolean {
        const rule = RULES[slot];
        if (!rule) return false;
        if (slot === 'interstitial' ? this._battleActive : this._battleActive) return false;
        const now = Date.now();
        const last = this._lastShowAt[slot] ?? 0;
        if (now - last < rule.minIntervalMs) return false;
        if ((this._matchCounts[slot] ?? 0) >= rule.perMatch && rule.perMatch > 0) return false;
        if (this._refreshDay() && (this._dayCounts[slot] ?? 0) >= rule.perDay) return false;
        return true;
    }

    public async rewarded(kind: AdScene): Promise<boolean> {
        if (!this.canShow(kind)) return false;
        const ok = await this._platform.showRewardedVideo(kind);
        if (ok) this._record(kind);
        return ok;
    }

    public async interstitial(): Promise<boolean> {
        if (this._battleActive) return false;
        if (!this.canShow('interstitial')) return false;
        const ok = await this._platform.showInterstitial();
        if (ok) this._record('interstitial');
        return ok;
    }

    private _record(slot: string): void {
        this._matchCounts[slot] = (this._matchCounts[slot] ?? 0) + 1;
        this._lastShowAt[slot] = Date.now();
        this._refreshDay();
        this._dayCounts[slot] = (this._dayCounts[slot] ?? 0) + 1;
        this._saveDay();
    }

    private _today(): string {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    private _refreshDay(): boolean {
        const t = this._today();
        if (t !== this._dayKey) {
            this._dayKey = t;
            this._dayCounts = {};
            this._saveDay();
            return true;
        }
        return false;
    }

    private _loadDay(): Record<string, number> {
        try {
            const raw = this._platform.getStorage('sa_ads_day');
            if (!raw) return {};
            const parsed = JSON.parse(raw) as { day: string; counts: Record<string, number> };
            if (parsed.day === this._today()) return parsed.counts ?? {};
        } catch { /* 存档损坏则重置 */ }
        return {};
    }

    private _saveDay(): void {
        try {
            this._platform.setStorage('sa_ads_day', JSON.stringify({ day: this._dayKey, counts: this._dayCounts }));
        } catch { /* noop */ }
    }
}
