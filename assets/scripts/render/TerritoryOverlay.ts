import { Node, MeshRenderer, Material, utils, Layers, Texture2D, Mesh } from 'cc';
import type { TerritoryGrid } from '../sim/Territory';
import { TerritoryTint } from './Palette';

/**
 * 领土覆盖层：128x128 CPU 纹理 + 透明 unlit 平面。
 * 每格 = 阵营色（半透明），边界格提亮成"亮线"，占领进度用透明度渐变表现"涌出"。
 * 深度测试开启（在地形之上、单位之下），深度写入关闭。
 */

const OVERLAY_HEIGHT = 0.08;

export class TerritoryOverlay {
    public readonly node: Node;
    private readonly _size: number;
    private readonly _texture: Texture2D;
    private readonly _pixels: Uint8Array;
    private _lastDirty = true;

    constructor(parent: Node, size: number) {
        this._size = size;
        this.node = new Node('TerritoryOverlay');
        this.node.layer = Layers.Enum.DEFAULT;
        parent.addChild(this.node);

        // 纹理
        this._texture = new Texture2D();
        this._texture.reset({
            width: size, height: size,
            format: Texture2D.PixelFormat.RGBA8888,
        });
        this._pixels = new Uint8Array(size * size * 4);

        // 平面网格（整图 0..1 uv）
        const mesh = utils.MeshUtils.createMesh({
            positions: [0, OVERLAY_HEIGHT, 0, size, OVERLAY_HEIGHT, 0, 0, OVERLAY_HEIGHT, size, size, OVERLAY_HEIGHT, size],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
            minPos: { x: 0, y: OVERLAY_HEIGHT - 0.01, z: 0 },
            maxPos: { x: size, y: OVERLAY_HEIGHT + 0.01, z: size },
        } as never);

        const mat = new Material();
        // 使用内置 unlit 的 transparent 技法：混合开启、深度写入关闭，避免手写管线状态
        mat.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true } });
        mat.setProperty('mainTexture', this._texture);

        const mr = this.node.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setMaterial(mat, 0);
        mr.receiveShadow = false;
    }

    public dispose(): void {
        this.node.destroy();
        this._texture.destroy();
    }

    /** 每帧从 sim 领土数据重绘像素；仅在 dirty 时上传纹理 */
    public sync(grid: TerritoryGrid, timeSec: number): void {
        const n = this._size;
        const px = this._pixels;
        const pulse = (Math.sin(timeSec * 2.2) + 1) / 2; // 边界呼吸

        for (let cz = 0; cz < n; cz++) {
            for (let cx = 0; cx < n; cx++) {
                const idx = cz * n + cx;
                const o = grid.owner[idx];
                const out = idx * 4;
                if (o === 0) {
                    const p = grid.progress[idx];
                    if (p <= 0) { px[out] = 0; px[out + 1] = 0; px[out + 2] = 0; px[out + 3] = 0; }
                    else {
                        // 争夺中：向某阵营渐变（这里用进度值最高的方向简化）
                        const tint = TerritoryTint.west;
                        px[out] = tint.r; px[out + 1] = tint.g; px[out + 2] = tint.b;
                        px[out + 3] = Math.round(30 + p * 70);
                    }
                } else {
                    const tint = o === 1 ? TerritoryTint.west : o === 2 ? TerritoryTint.east : TerritoryTint.south;
                    const isBorder = grid.borderMask[idx] === 1;
                    const boost = isBorder ? 1.35 + pulse * 0.25 : 1.0;
                    const alpha = isBorder ? 200 : 120;
                    px[out] = Math.min(255, Math.round(tint.r * boost));
                    px[out + 1] = Math.min(255, Math.round(tint.g * boost));
                    px[out + 2] = Math.min(255, Math.round(tint.b * boost));
                    px[out + 3] = alpha;
                }
            }
        }
        if (grid.dirty) {
            this._texture.uploadData(this._pixels);
            grid.dirty = false;
        }
    }

    public destroy(): void {
        this.node.destroy();
    }
}
