import io

# standard 材质属性名：albedo -> mainColor（引擎里属性名是 mainColor，target 才是 albedo）
for p in [
    'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/TerrainRenderer.ts',
    'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/WorldView.ts',
]:
    s = io.open(p, encoding='utf-8').read()
    s = s.replace("mat.setProperty('albedo'", "mat.setProperty('mainColor'")
    io.open(p, 'w', encoding='utf-8').write(s)

# 领土覆盖层：用 unlit 的 transparent 技法（technique:1）替代手写 blend 状态
p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/TerritoryOverlay.ts'
s = io.open(p, encoding='utf-8').read()
old = """        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_TEXTURE: true },
            states: {
                blendState: {
                    targets: [{
                        blend: true, blendSrc: 2, blendDst: 4,
                        blendSrcAlpha: 2, blendDstAlpha: 4,
                    }],
                },
                depthStencilState: { depthTest: true, depthWrite: false },
                rasterizerState: { cullMode: 2 }, // CULL_MODE_NONE
            },
        });
        mat.setProperty('mainTexture', this._texture);"""
new = """        const mat = new Material();
        // 使用内置 unlit 的 transparent 技法：混合开启、深度写入关闭，避免手写管线状态
        mat.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true } });
        mat.setProperty('mainTexture', this._texture);"""
if old in s:
    s = s.replace(old, new)
    print('overlay material replaced')
else:
    print('WARN overlay block not matched')
io.open(p, 'w', encoding='utf-8').write(s)
