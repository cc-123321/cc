import io

p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/CameraRig.ts'
s = io.open(p, encoding='utf-8').read()

old_proj = """    /** 屏幕（UI 坐标，设计分辨率单位）→ 地面世界坐标 */
    public screenToGround(sx: number, sy: number): { x: number; z: number } {
        const oh = this.orthoHeight;
        const u = (sx - this._screenW / 2) * (2 * oh) / this._screenH;
        const v = (sy - this._screenH / 2) * (2 * oh) / this._screenH;
        const sinP = Math.sin(PITCH * Math.PI / 180);
        const cosP = Math.cos(PITCH * Math.PI / 180);
        const x = this.centerX + u;
        const z = this.centerZ - v * sinP - CAM_HEIGHT * cosP / sinP - v * cosP * cosP / sinP;
        return { x, z };
    }"""
new_proj = """    /** 屏幕（UI 坐标，设计分辨率单位）→ 地面世界坐标（正交俯视的解析反投影） */
    public screenToGround(sx: number, sy: number): { x: number; z: number } {
        const oh = this.orthoHeight;
        const sinP = Math.sin(PITCH * Math.PI / 180);
        const u = (sx - this._screenW / 2) * (2 * oh) / this._screenH;
        const v = (sy - this._screenH / 2) * (2 * oh) / this._screenH;
        return { x: this.centerX + u, z: this.centerZ - v / sinP };
    }"""
if old_proj in s:
    s = s.replace(old_proj, new_proj, 1)
    print('screenToGround fixed')
else:
    print('WARN screenToGround pattern not found')

old_tr = """    private _applyTransform(withShake = false): void {
        const x = this.centerX + (withShake ? this._shakeX : 0);
        const z = this.centerZ + (withShake ? this._shakeZ : 0);
        this.node.setPosition(x, CAM_HEIGHT, z);
        this.node.setRotationFromEuler(-PITCH, 0, 0);
    }"""
new_tr = """    private _applyTransform(withShake = false): void {
        const x = this.centerX + (withShake ? this._shakeX : 0);
        const z = this.centerZ + (withShake ? this._shakeZ : 0);
        // 相机沿视线方向后退，保证 centerX/centerZ 正好是画面中心的地面点
        const back = CAM_HEIGHT / Math.tan(PITCH * Math.PI / 180);
        this.node.setPosition(x, CAM_HEIGHT, z + back);
        this.node.setRotationFromEuler(-PITCH, 0, 0);
    }"""
if old_tr in s:
    s = s.replace(old_tr, new_tr, 1)
    print('camera transform fixed')
else:
    print('WARN applyTransform pattern not found')

io.open(p, 'w', encoding='utf-8').write(s)
