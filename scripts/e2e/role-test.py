# 各權限角色的網站巡檢(2026-10-09)
# 用 web/.env.local 裡的測試帳號登入,逐頁打開、截圖、記錄錯誤,檢查權限是否擋對。
#
# ⚠ 只「看」不「改」:只做登入與換頁,不按任何會改資料的按鈕(扭蛋、發獎勵、作答、建立考卷…)。
# ⚠ 密碼只從 .env.local 讀,不印出、不寫進報告。
#
# web/.env.local 需要的設定(沒設的角色會略過):
#   E2E_BASE_URL=https://cap-three-ruddy.vercel.app      (預設正式站;本機測試可改 http://localhost:3000)
#   E2E_STUDENT_EMAIL=…   E2E_STUDENT_PASSWORD=…         學生
#   E2E_PARENT_EMAIL=…    E2E_PARENT_PASSWORD=…          家長 L1(全部管理功能)
#   E2E_TEACHER_EMAIL=…   E2E_TEACHER_PASSWORD=…         老師 L1(全部管理功能)
#   E2E_GUARDIAN_EMAIL=…  E2E_GUARDIAN_PASSWORD=…        家長 L2(只能看學習狀況、發放獎勵)
#
# 用法:python scripts/e2e/role-test.py [--roles student,parent] [--headed]
# 結果:data/e2e/<時間>/report.md、report.json、<角色>/<頁面>.png(data/e2e 只留本機,含孩子的資料)
import json, os, re, sys, time
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def load_env(path):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
            if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env

ENV = load_env(os.path.join(ROOT, "web", ".env.local"))
BASE = ENV.get("E2E_BASE_URL", "https://cap-three-ruddy.vercel.app").rstrip("/")
ARGS = sys.argv[1:]
ONLY = set(ARGS[ARGS.index("--roles") + 1].split(",")) if "--roles" in ARGS else None
HEADED = "--headed" in ARGS

# 一般頁面(所有角色都會打開)
COMMON = ["/", "/practice", "/learn", "/chapters", "/wrong-book", "/history", "/me", "/leaderboard",
          "/friends", "/shop", "/market", "/boss", "/challenge", "/arena", "/contest", "/mock-exam",
          "/diagnose", "/insight", "/realm", "/duel"]
# 管理頁面:L2 = 家長 L2 也能用的;其餘只限 L1(teacher/parent)
ADMIN_L2 = ["/admin", "/admin/progress", "/admin/rewards"]
ADMIN_L1 = ["/admin/questions", "/admin/users", "/admin/audit", "/admin/reports", "/admin/vouchers",
            "/admin/shop", "/admin/pets", "/admin/realms"]

ROLES = {
    "student":  {"label": "學生",     "admin_ok": set()},
    "parent":   {"label": "家長 L1",  "admin_ok": set(ADMIN_L2 + ADMIN_L1)},
    "teacher":  {"label": "老師 L1",  "admin_ok": set(ADMIN_L2 + ADMIN_L1)},
    "guardian": {"label": "家長 L2",  "admin_ok": set(ADMIN_L2)},
}
DENIED = re.compile(r"需要管理者權限|只有老師/家長|沒有權限|無權限")
CRASH = re.compile(r"Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|發生錯誤|出錯了")
# 不算錯誤的雜訊(瀏覽器擴充、favicon、Vercel 分析)
IGNORE = re.compile(r"favicon|_vercel/insights|_vercel/speed-insights|chrome-extension")

def slug(path):
    return "home" if path == "/" else path.strip("/").replace("/", "_")

def login(page, email, password):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.get_by_placeholder("姓名或 Email").fill(email)
    page.get_by_placeholder("密碼(至少 6 碼)").fill(password)
    page.locator("form button[type=submit], form button").first.click()
    try:
        page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        return True, ""
    except PWTimeout:
        txt = page.locator("body").inner_text()[:200]
        return False, f"登入後仍停在登入頁:{txt}"

def check_page(page, role, path, outdir):
    errors, failed = [], []
    on_console = lambda m: errors.append(m.text[:300]) if m.type == "error" and not IGNORE.search(m.text) else None
    on_pageerror = lambda e: errors.append(f"pageerror: {str(e)[:300]}")
    on_response = lambda r: failed.append(f"{r.status} {r.request.method} {r.url[:160]}") if r.status >= 400 and not IGNORE.search(r.url) else None
    page.on("console", on_console); page.on("pageerror", on_pageerror); page.on("response", on_response)
    t0 = time.time()
    status, note = None, ""
    try:
        resp = page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=30000)
        status = resp.status if resp else None
        try: page.wait_for_load_state("networkidle", timeout=15000)
        except PWTimeout: note = "15 秒內網路沒有停(可能有輪詢/即時連線)"
        page.wait_for_timeout(800)
    except Exception as e:
        note = f"打不開:{str(e)[:200]}"
    ms = int((time.time() - t0) * 1000)
    body = ""
    try: body = page.locator("body").inner_text(timeout=5000)
    except Exception: pass
    shot = os.path.join(outdir, f"{slug(path)}.png")
    try: page.screenshot(path=shot, full_page=True)
    except Exception: shot = None
    page.remove_listener("console", on_console); page.remove_listener("pageerror", on_pageerror); page.remove_listener("response", on_response)

    final = page.url.replace(BASE, "") or "/"
    denied = bool(DENIED.search(body))
    crash = CRASH.search(body)
    problems = []
    if status and status >= 400: problems.append(f"HTTP {status}")
    if "/login" in final and path != "/login": problems.append("被導回登入頁(登入狀態掉了?)")
    if crash: problems.append(f"錯誤畫面:「{crash.group(0)}」")
    if errors: problems.append(f"前端錯誤 {len(errors)} 則")
    if failed: problems.append(f"請求失敗 {len(failed)} 個")
    if note.startswith("打不開"): problems.append(note)
    # 權限檢查
    if path.startswith("/admin"):
        should = path in ROLES[role]["admin_ok"]
        if should and denied: problems.append("❗ 應該能進,卻顯示沒有權限")
        if not should and not denied: problems.append("❗ 不應該能進,卻沒有顯示權限不足(請看截圖確認)")
    elif denied:
        problems.append("❗ 一般頁面顯示沒有權限")
    return {"path": path, "final_url": final, "status": status, "ms": ms, "denied": denied,
            "ok": not problems, "problems": problems, "console_errors": errors[:10], "failed_requests": failed[:10],
            "note": note, "screenshot": os.path.relpath(shot, ROOT) if shot else None,
            "text_head": re.sub(r"\s+", " ", body)[:160]}

def main():
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(ROOT, "data", "e2e", stamp)
    os.makedirs(out, exist_ok=True)
    report = {"base": BASE, "time": stamp, "roles": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not HEADED)
        for role, cfg in ROLES.items():
            if ONLY and role not in ONLY: continue
            email, pw = ENV.get(f"E2E_{role.upper()}_EMAIL"), ENV.get(f"E2E_{role.upper()}_PASSWORD")
            if not email or not pw:
                report["roles"][role] = {"label": cfg["label"], "skipped": "web/.env.local 沒有設定這個角色的帳號"}
                print(f"[{cfg['label']}] 略過(沒有設定帳號)"); continue
            print(f"[{cfg['label']}] {email} 登入中…")
            ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-TW")
            page = ctx.new_page()
            ok, why = login(page, email, pw)
            rdir = os.path.join(out, role); os.makedirs(rdir, exist_ok=True)
            entry = {"label": cfg["label"], "email": email, "login_ok": ok, "login_note": why, "pages": []}
            if ok:
                for path in COMMON + ADMIN_L2 + ADMIN_L1:
                    r = check_page(page, role, path, rdir)
                    entry["pages"].append(r)
                    print(f"  {'✅' if r['ok'] else '❌'} {path:<18} {r['ms']:>5}ms {'; '.join(r['problems'])}")
            else:
                print(f"  ❌ 登入失敗:{why}")
            report["roles"][role] = entry
            ctx.close()
        browser.close()
    json.dump(report, open(os.path.join(out, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 人看的摘要
    lines = [f"# 角色巡檢 {stamp}", f"網站:{BASE}", ""]
    for role, e in report["roles"].items():
        if "skipped" in e: lines.append(f"## {e['label']}:略過({e['skipped']})"); continue
        if not e["login_ok"]: lines.append(f"## {e['label']}:❌ 登入失敗 — {e['login_note']}"); continue
        bad = [x for x in e["pages"] if not x["ok"]]
        lines.append(f"## {e['label']}({e['email']}):{len(e['pages']) - len(bad)}/{len(e['pages'])} 頁正常")
        for x in bad:
            lines.append(f"- ❌ `{x['path']}`:{';'.join(x['problems'])}  → {x['screenshot']}")
            for c in x["console_errors"][:3]: lines.append(f"  - console:{c}")
            for f in x["failed_requests"][:3]: lines.append(f"  - request:{f}")
        slow = [x for x in e["pages"] if x["ms"] > 5000]
        if slow: lines.append(f"- 🐢 超過 5 秒:{', '.join(f'{x['path']}({x['ms']}ms)' for x in slow)}")
        lines.append("")
    open(os.path.join(out, "report.md"), "w", encoding="utf-8").write("\n".join(lines))
    print(f"\n報告:{os.path.relpath(os.path.join(out, 'report.md'), ROOT)}")

if __name__ == "__main__":
    main()
