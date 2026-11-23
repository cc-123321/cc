import io

# 1) WorldView 用 game.deltaTime（去掉 director.getDeltaTime 弃用告警）
p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/WorldView.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("import { Node, MeshRenderer, Material, Color, Vec3, Mesh, director } from 'cc';",
              "import { Node, MeshRenderer, Material, Color, Vec3, Mesh, game } from 'cc';")
s = s.replace("const dt = director.getDeltaTime();", "const dt = game.deltaTime;")
io.open(p, 'w', encoding='utf-8').write(s)

# 2) DEBUG 下暴露 world 到全局，便于 QA 内省
p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/game/GameDirector.ts'
s = io.open(p, encoding='utf-8').read()
old = """        this._terrainRenderer = new TerrainRenderer(this._root, world.terrain);"""
new = """        if (DEBUG) (globalThis as unknown as Record<string, unknown>).__saWorld = world;
        this._terrainRenderer = new TerrainRenderer(this._root, world.terrain);"""
if old in s:
    s = s.replace(old, new, 1)
    print('debug hook added')
else:
    print('WARN debug hook not matched')
io.open(p, 'w', encoding='utf-8').write(s)
print('done')
