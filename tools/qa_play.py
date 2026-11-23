"""端到端验收：启动 → 出战场景 → 点开始作战 → 点击推进 → 截图 + 抓异常。"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8899/index.html'
PREFIX = sys.argv[2] if len(sys.argv) > 2 else r'd:\Cocos游戏源码合集\风暴行动\tools\qa'

logs = []

def shot(page, name):
    try:
        page.screenshot(path=f'{PREFIX}_{name}.png')
    except Exception as e:
        logs.append(f'[shot {name} fail] {e}')

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e) + '\n' + (e.stack or '')[:500]))
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(6000)
    shot(page, '01_start')

    # 点「开始作战」（屏幕坐标 640,180 → 视口 y=720-180=540）
    page.mouse.click(640, 540)
    page.wait_for_timeout(2500)
    shot(page, '02_deploy')

    # 布阵阶段：点「提前开战」上方空白 → 直接点屏幕中央附近下令推进
    page.mouse.click(640, 300)
    page.wait_for_timeout(1500)
    shot(page, '03_push')

    # 切 3× 加速（右下角按钮：x≈1170,y≈60 → 视口 y=660）
    page.mouse.click(1180, 660)
    page.wait_for_timeout(4000)
    shot(page, '04_battle')

    # 点底部产兵按钮（步兵卡：面板中心 720，y=104+18；视口 y ≈ 720-(104+18)=598，x≈720-302+82=500）
    page.mouse.click(500, 560)
    page.wait_for_timeout(3000)
    shot(page, '05_produce')

    b.close()

print(f'--- e2e logs ({len(logs)}) ---')
for line in logs[:30]:
    print(line[:300])
