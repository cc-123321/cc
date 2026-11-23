import io

# 1) 地形网格补 UV（避免 standard 材质缺失 a_texCoord）
p = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/TerrainRenderer.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace(
    "        const indices = new Uint32Array(n * n * 6);",
    "        const uvs = new Float32Array(vertCount * 2);\n"
    "        for (let j = 0; j <= n; j++) {\n"
    "            for (let i = 0; i <= n; i++) {\n"
    "                const idx = j * (n + 1) + i;\n"
    "                uvs[idx * 2] = i / n;\n"
    "                uvs[idx * 2 + 1] = j / n;\n"
    "            }\n"
    "        }\n\n"
    "        const indices = new Uint32Array(n * n * 6);",
)
s = s.replace(
    "            normals: normals as unknown as number[],\n            colors: colors as unknown as number[],",
    "            normals: normals as unknown as number[],\n            uvs: uvs as unknown as number[],\n            colors: colors as unknown as number[],",
)
io.open(p, 'w', encoding='utf-8').write(s)

# 2) 单位/建筑网格补 UV
p2 = 'd:/Cocos游戏源码合集/风暴行动/assets/scripts/render/MeshFactory.ts'
s2 = io.open(p2, encoding='utf-8').read()
s2 = s2.replace(
    "    positions: number[] = [];\n    normals: number[] = [];\n    colors: number[] = [];",
    "    positions: number[] = [];\n    normals: number[] = [];\n    uvs: number[] = [];\n    colors: number[] = [];",
)
s2 = s2.replace(
    "                this.colors.push(color[0], color[1], color[2], 1);\n            }\n            this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);",
    "                this.colors.push(color[0], color[1], color[2], 1);\n                this.uvs.push(0, 0);\n            }\n            this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);",
)
s2 = s2.replace(
    "                this.colors.push(color[0], color[1], color[2], 1);\n            }\n        }",
    "                this.colors.push(color[0], color[1], color[2], 1);\n                this.uvs.push(0, 0);\n            }\n        }",
)
s2 = s2.replace(
    "            this.colors.push(color[0], color[1], color[2], 1);\n        }\n        for (let i = 0; i < 4; i++) {",
    "            this.colors.push(color[0], color[1], color[2], 1);\n            this.uvs.push(0, 0);\n        }\n        for (let i = 0; i < 4; i++) {",
)
s2 = s2.replace(
    "                this.colors.push(color[0], color[1], color[2], 1);\n            }\n            this.indices.push(vBase, vBase + 1, vBase + 2);",
    "                this.colors.push(color[0], color[1], color[2], 1);\n                this.uvs.push(0, 0);\n            }\n            this.indices.push(vBase, vBase + 1, vBase + 2);",
)
s2 = s2.replace(
    "            positions: this.positions,\n            normals: this.normals,\n            colors: this.colors,",
    "            positions: this.positions,\n            normals: this.normals,\n            uvs: this.uvs,\n            colors: this.colors,",
)
io.open(p2, 'w', encoding='utf-8').write(s2)
print('patched uvs')
