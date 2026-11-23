import { Node, Camera, Vec3 } from 'cc';
import { clamp } from '../core/MathUtils';

/**
 * 16:9 正交俯视相机（RTS 镜头）。
 * - 单指拖动平移（屏幕增量 → 世界增量）
 * - 双指捏合 / 滚轮缩放（orthoHeight）
 * - 边界夹取、震屏、战斗缓推镜
 */

const PITCH = 55;                 // 俯视角度（度）
const CAM_HEIGHT = 130;           // 相机高度（世界单位）
const MIN_ORTHO = 9;
const MAX_ORTHO = 44;

export class CameraRig {
    public readonly node: Node;
    public readonly cam: Camera;
    public orthoHeight = 18;
    public centerX = 64;
    public centerZ = 64;

    private readonly _mapSize: number;
    private readonly _screenW: number;
    private readonly _screenH: number;
    private _shakeTime = 0;
    private _shakeAmp = 0;
    private _shakeX = 0;
    private _shakeZ = 0;

    constructor(node: Node, cam: Camera, mapSize: number, screenW: number, screenH: number) {
        this.node = node;
        this.cam = cam;
        this._mapSize = mapSize;
        this._screenW = screenW;
        this._screenH = screenH;
        this._applyTransform();
    }

    /** 屏幕（UI 坐标，设计分辨率单位）→ 地面世界坐标（正交俯视的解析反投影） */
    public screenToGround(sx: number, sy: number): { x: number; z: number } {
        const oh = this.orthoHeight;
        const sinP = Math.sin(PITCH * Math.PI / 180);
        const u = (sx - this._screenW / 2) * (2 * oh) / this._screenH;
        const v = (sy - this._screenH / 2) * (2 * oh) / this._screenH;
        return { x: this.centerX + u, z: this.centerZ - v / sinP };
    }

    /** 屏幕增量 → 世界平移（拖动用） */
    public panByScreen(dxScreen: number, dyScreen: number): void {
        const oh = this.orthoHeight;
        const scale = (2 * oh) / this._screenH;
        this.centerX -= dxScreen * scale;
        this.centerZ += dyScreen * scale; // 屏幕 y 向上，世界 z 向下
        this.clampCenter();
        this._applyTransform();
    }

    public panTo(wx: number, wz: number): void {
        this.centerX = wx;
        this.centerZ = wz;
        this.clampCenter();
        this._applyTransform();
    }

    public zoomBy(delta: number): void {
        this.orthoHeight = clamp(this.orthoHeight + delta, MIN_ORTHO, MAX_ORTHO);
        this.clampCenter();
        this._applyTransform();
    }

    /** 震屏 */
    public shake(amp: number, duration: number): void {
        this._shakeAmp = Math.max(this._shakeAmp, amp);
        this._shakeTime = Math.max(this._shakeTime, duration);
    }

    public update(dt: number): void {
        if (this._shakeTime > 0) {
            this._shakeTime -= dt;
            const decay = this._shakeTime / Math.max(0.001, this._shakeTime + dt);
            this._shakeAmp *= decay * 0.9 + 0.08;
            this._shakeX = (Math.random() * 2 - 1) * this._shakeAmp;
            this._shakeZ = (Math.random() * 2 - 1) * this._shakeAmp;
            this._applyTransform(true);
            if (this._shakeTime <= 0) { this._shakeX = 0; this._shakeZ = 0; this._applyTransform(); }
        }
    }

    private clampCenter(): void {
        const m = this._mapSize;
        const pad = Math.min(this.orthoHeight * 1.2, m * 0.2);
        this.centerX = clamp(this.centerX, pad, m - pad);
        this.centerZ = clamp(this.centerZ, pad, m - pad);
    }

    private _applyTransform(withShake = false): void {
        const x = this.centerX + (withShake ? this._shakeX : 0);
        const z = this.centerZ + (withShake ? this._shakeZ : 0);
        // 相机沿视线方向后退，保证 centerX/centerZ 正好是画面中心的地面点
        const back = CAM_HEIGHT / Math.tan(PITCH * Math.PI / 180);
        this.node.setPosition(x, CAM_HEIGHT, z + back);
        this.node.setRotationFromEuler(-PITCH, 0, 0);
    }

    public get visibleHalfWidth(): number {
        return this.orthoHeight * (this._screenW / this._screenH);
    }

    public viewBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
        const hw = this.visibleHalfWidth;
        const hv = this.orthoHeight / Math.sin(PITCH * Math.PI / 180);
        return {
            minX: this.centerX - hw, maxX: this.centerX + hw,
            minZ: this.centerZ - hv, maxZ: this.centerZ + hv,
        };
    }
}
