/**
 * cc 模块占位声明：无头测试只编译 sim/core/data/economy/ai，
 * ConfigLoader 通过 import type 被拉入，需要一个极简 'cc' 声明。
 */
declare module 'cc' {
    export class JsonAsset {
        json: unknown;
    }
    export const resources: {
        load(path: string, type: unknown, cb: (err: Error | null, asset?: JsonAsset) => void): void;
    };
}

declare const console: {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};
