import io

ROOT = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/'

# ---------------- 1) MeshFactory：烘焙主光到顶点色 ----------------
p = ROOT + 'MeshFactory.ts'
s = io.open(p, encoding='utf-8').read()
old = """    toMesh(name: string): Mesh {
        const geo = {"""
new = """    /** 烘焙主光方向到顶点色：unlit 材质下也能看出体积与明暗 */
    bakeShading(): void {
        const lx = -0.42, ly = 0.82, lz = -0.39;
        const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
        for (let i = 0; i < this.colors.length / 4; i++) {
            const nx = this.normals[i * 3], ny = this.normals[i * 3 + 1], nz = this.normals[i * 3 + 2];
            const d = (nx * lx + ny * ly + nz * lz) / ll;
            const s = 0.52 + 0.48 * Math.max(0, d);
            this.colors[i * 4] *= s;
            this.colors[i * 4 + 1] *= s;
            this.colors[i * 4 + 2] *= s;
        }
    }

    toMesh(name: string): Mesh {
        this.bakeShading();
        const geo = {"""
if old in s:
    s = s.replace(old, new, 1)
    print('meshfactory bake hooked')
else:
    print('WARN meshfactory hook not matched')
io.open(p, 'w', encoding='utf-8').write(s)

# ---------------- 2) WorldView：standard -> unlit ----------------
p = ROOT + 'WorldView.ts'
s = io.open(p, encoding='utf-8').read()
old = """        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-standard',
            defines: { USE_VERTEX_COLOR: true } as never,
        });
        mat.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));
        mat.setProperty('roughness', rough);
        mat.setProperty('metallic', metal);
        mat.setProperty('useShadowMap', true);"""
new = """        const mat = new Material();
        // 本次构建只注册了 builtin-unlit：用顶点色烘焙主光获得体积感（零 shader 依赖）
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_VERTEX_COLOR: true } as never,
        });
        mat.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));"""
if old in s:
    s = s.replace(old, new, 1)
    print('worldview material switched to unlit')
else:
    print('WARN worldview material block not matched')
io.open(p, 'w', encoding='utf-8').write(s)

# ---------------- 3) TerrainRenderer：unlit + 烘焙明暗 ----------------
p = ROOT + 'TerrainRenderer.ts'
s = io.open(p, encoding='utf-8').read()
old = """        const mat = new Material();
        mat.initialize({ effectName: 'builtin-standard', defines: { USE_VERTEX_COLOR: true } });
        mat.setProperty('mainColor', new Color(255, 255, 255, 255));
        mat.setProperty('roughness', 0.95);
        mat.setProperty('metallic', 0.0);"""
new = """        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        mat.setProperty('mainColor', new Color(255, 255, 255, 255));"""
if old in s:
    s = s.replace(old, new, 1)
    print('terrain material switched to unlit')
else:
    print('WARN terrain material block not matched')

# 顶点色烘焙主光（在创建 mesh 前统一处理）
old2 = """        const mesh = utils.MeshUtils.createMesh({"""
new2 = """        // 烘焙主光到顶点色（unlit 下的明暗层次）
        const lx = -0.42, ly = 0.82, lz = -0.39;
        const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
        for (let vi = 0; vi < vertCount; vi++) {
            const d = (normals[vi * 3] * lx + normals[vi * 3 + 1] * ly + normals[vi * 3 + 2] * lz) / ll;
            const sh = 0.55 + 0.45 * Math.max(0, d);
            colors[vi * 4] *= sh;
            colors[vi * 4 + 1] *= sh;
            colors[vi * 4 + 2] *= sh;
        }

        const mesh = utils.MeshUtils.createMesh({"""
if old2 in s:
    s = s.replace(old2, new2, 1)
    print('terrain shading baked')
else:
    print('WARN terrain shading hook not matched')
io.open(p, 'w', encoding='utf-8').write(s)
