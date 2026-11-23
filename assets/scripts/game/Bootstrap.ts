import {
    _decorator, Component, Node, view, ResolutionPolicy, Camera, Layers,
    DirectionalLight, Color, Canvas, UITransform, Vec3,
} from 'cc';
import { DEBUG } from 'cc/env';
import { GameDirector } from './GameDirector';

const { ccclass } = _decorator;

/**
 * 游戏唯一入口组件（场景中只挂这一个，其余全部运行时构建）。
 * 职责：横屏 16:9 分辨率 → 3D 主相机 + UI 相机 + 主光 → Canvas → 启动 GameDirector。
 */
@ccclass('Bootstrap')
export class Bootstrap extends Component {
    private _director: GameDirector | null = null;

    protected start(): void {
        void this.boot();
    }

    private async boot(): Promise<void> {
        this._installErrorBanner();

        // 1. 横屏 16:9（SHOW_ALL：不同比例下不裁切关键信息）
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);

        // 2. 3D 主相机：正交低角度俯视，制造宽幅战场构图
        const camNode = new Node('MainCamera');
        camNode.layer = Layers.Enum.DEFAULT;
        this.node.addChild(camNode);
        camNode.setPosition(64, 90, 64);
        camNode.setRotationFromEuler(-56, 0, 0);
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = 18;
        cam.near = 1;
        cam.far = 600;
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        cam.clearColor = new Color(12, 18, 22, 255);
        cam.visibility = Layers.Enum.DEFAULT;

        // 3. UI 相机：正交正视，只渲染 UI_2D（不清理颜色，叠加在战场之上）
        const uiCamNode = new Node('UICamera');
        uiCamNode.layer = Layers.Enum.UI_2D;
        this.node.addChild(uiCamNode);
        uiCamNode.setPosition(new Vec3(640, 360, 1000));
        const uiCam = uiCamNode.addComponent(Camera);
        uiCam.projection = Camera.ProjectionType.ORTHO;
        uiCam.orthoHeight = 360;
        uiCam.near = 1;
        uiCam.far = 2000;
        uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        uiCam.visibility = Layers.Enum.UI_2D;

        // 4. 主方向光（单主光 + 阴影 = 体积感）
        const lightNode = new Node('MainLight');
        lightNode.layer = Layers.Enum.DEFAULT;
        this.node.addChild(lightNode);
        lightNode.setRotationFromEuler(-62, -28, 0);
        const light = lightNode.addComponent(DirectionalLight);
        light.color = new Color(255, 248, 236, 255);
        light.illuminance = 42000;
        light.shadowEnabled = true;
        light.shadowPcf = 2;
        light.shadowNormalBias = 0.6;

        // 5. Canvas（UI 根）
        const canvasNode = new Node('Canvas');
        canvasNode.layer = Layers.Enum.UI_2D;
        this.node.addChild(canvasNode);
        canvasNode.setPosition(new Vec3(640, 360, 0));
        const ut = canvasNode.addComponent(UITransform);
        ut.setContentSize(1280, 720);
        const canvas = canvasNode.addComponent(Canvas);
        canvas.cameraComponent = uiCam;

        // 6. 启动游戏流程
        this._director = new GameDirector(this.node, camNode, cam, canvasNode);
        await this._director.init();

        if (DEBUG) console.log('[StormAction] bootstrap complete');
    }

    protected update(dt: number): void {
        this._director?.update(dt);
    }

    /**
     * 运行时错误可视化：浏览器预览时把异常显示成红条，避免"黑屏无提示"。
     * 小游戏环境没有 document，自动跳过。
     */
    private _installErrorBanner(): void {
        if (typeof document === 'undefined' || !DEBUG) return;
        const show = (msg: string) => {
            let el = document.getElementById('sa-error');
            if (!el) {
                el = document.createElement('div');
                el.id = 'sa-error';
                el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:38%;overflow:auto;' +
                    'background:rgba(120,20,20,0.92);color:#fff;font:12px/1.5 monospace;padding:8px;z-index:9999;white-space:pre-wrap';
                document.body.appendChild(el);
            }
            el.textContent = `${el.textContent ?? ''}\n${msg}`.trim();
        };
        window.addEventListener('error', (e: ErrorEvent) => show(`[error] ${e.message}\n${e.filename}:${e.lineno}`));
        window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => show(`[promise] ${String(e.reason)}`));
        const oldWarn = console.warn.bind(console);
        console.warn = (...args: unknown[]) => { show(`[warn] ${args.join(' ')}`); oldWarn(...args); };
    }
}
