"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rng = void 0;
/**
 * 确定性随机数：mulberry32。
 * 同一 seed 必然产生同一序列 —— 这是"改布阵重打此局"与战报归因的前提。
 * 逻辑层（sim）只允许使用本 RNG，禁止 Math.random。
 */
class Rng {
    constructor(seed) {
        this._state = seed >>> 0;
    }
    /** 归一化 [0,1) */
    next() {
        this._state = (this._state + 0x6D2B79F5) >>> 0;
        let t = this._state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** [min,max) 浮点 */
    range(min, max) {
        return min + (max - min) * this.next();
    }
    /** [min,max] 整数（含两端） */
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }
    /** 从数组中随机取一个 */
    pick(arr) {
        return arr[this.int(0, arr.length - 1)];
    }
    /** 洗牌（Fisher–Yates），返回新数组 */
    shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
    /** 高斯近似（Box–Muller 的简化：多个均匀求均值），用于山丘等自然形态 */
    gauss(mean, stdDev) {
        let sum = 0;
        for (let i = 0; i < 4; i++)
            sum += this.next();
        return mean + (sum - 2) / 2 * stdDev * 2;
    }
    get state() {
        return this._state;
    }
}
exports.Rng = Rng;
