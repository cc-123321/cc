"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandQueue = void 0;
class CommandQueue {
    constructor() {
        this._queue = [];
    }
    push(cmd) {
        this._queue.push(cmd);
    }
    clear() {
        this._queue.length = 0;
    }
    drain() {
        const out = this._queue;
        this._queue = [];
        return out;
    }
}
exports.CommandQueue = CommandQueue;
