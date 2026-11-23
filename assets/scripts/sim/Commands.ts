import { FactionId } from '../data/ConfigTypes';
import { TacticId } from './Tactics';

/**
 * 玩家/AI → sim 的命令队列（UI 只发命令，不直接改世界）。
 */

export type SimCommand =
    | { kind: 'deployUnit'; faction: FactionId; unitType: string; x: number; z: number }
    | { kind: 'queueUnit'; faction: FactionId; buildingId: number; unitType: string }
    | { kind: 'autoProduce'; faction: FactionId; buildingId: number; unitType: string | null }
    | { kind: 'build'; faction: FactionId; buildingType: string; x: number; z: number }
    | { kind: 'rally'; faction: FactionId; x: number; z: number; weight: number }
    | { kind: 'tactic'; faction: FactionId; tactic: TacticId; x: number; z: number }
    | { kind: 'moveUnit'; faction: FactionId; unitId: number; x: number; z: number }
    | { kind: 'skipDeploy'; faction: FactionId; seconds: number };

export class CommandQueue {
    private _queue: SimCommand[] = [];

    public push(cmd: SimCommand): void {
        this._queue.push(cmd);
    }

    public clear(): void {
        this._queue.length = 0;
    }

    public drain(): SimCommand[] {
        const out = this._queue;
        this._queue = [];
        return out;
    }
}
