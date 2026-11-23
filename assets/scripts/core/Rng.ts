/**
 * 确定性随机数：mulberry32。
 * 同一 seed 必然产生同一序列 —— 这是"改布阵重打此局"与战报归因的前提。
 * 逻辑层（sim）只允许使用本 RNG，禁止 Math.random。
 */
export class Rng {
    private _state: number;

    constructor(seed: number) {
        this._state = seed >>> 0;
    }

    /** 归一化 [0,1) */
    public next(): number {
        this._state = (this._state + 0x6D2B79F5) >>> 0;
        let t = this._state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** [min,max) 浮点 */
    public range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    /** [min,max] 整数（含两端） */
    public int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }

    /** 从数组中随机取一个 */
    public pick<T>(arr: readonly T[]): T {
        return arr[this.int(0, arr.length - 1)];
    }

    /** 洗牌（Fisher–Yates），返回新数组 */
    public shuffle<T>(arr: readonly T[]): T[] {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    /** 高斯近似（Box–Muller 的简化：多个均匀求均值），用于山丘等自然形态 */
    public gauss(mean: number, stdDev: number): number {
        let sum = 0;
        for (let i = 0; i < 4; i++) sum += this.next();
        return mean + (sum - 2) / 2 * stdDev * 2;
    }

    public get state(): number {
        return this._state;
    }
}
