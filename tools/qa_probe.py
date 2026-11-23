"""Playwright 探针：抓控制台日志/异常堆栈/404 资源 + 截图。"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8899/index.html'
SHOT = sys.argv[2] if len(sys.argv) > 2 else r'd:\Cocos游戏源码合集\风暴行动\tools\qa1.png'
WAIT_MS = int(sys.argv[3]) if len(sys.argv) > 3 else 9000

logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    )
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append('[pageerror] ' + str(e) + '\n' + (e.stack or '')[:600]))
    page.on('response', lambda r: logs.append(f'[http {r.status}] {r.url}') if r.status >= 400 else None)
    page.on('requestfailed', lambda r: logs.append(f'[reqfail] {r.url} {r.failure}'))
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(WAIT_MS)
    try:
        page.screenshot(path=SHOT)
    except Exception as e:
        logs.append(f'[shot fail] {e}')
    browser.close()

print(f'--- probe logs ({len(logs)}) ---')
for line in logs[:40]:
    print(line[:400])
