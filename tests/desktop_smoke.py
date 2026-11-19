"""Exercise the actual Windows application with an isolated WebView2 profile.

Run after building, with Python and Playwright installed. No browser download is needed.
"""
import base64
import ctypes
from ctypes import wintypes
from datetime import date
import json
from pathlib import Path
import os
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


EXE = Path(__file__).resolve().parents[1] / "build" / "app" / "GlassDeskCalendar.exe"
USER32 = ctypes.windll.user32
USER32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
USER32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
USER32.GetWindowThreadProcessId.argtypes = [wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
USER32.GetParent.argtypes = [wintypes.HWND]
USER32.GetParent.restype = wintypes.HWND
USER32.FindWindowExW.argtypes = [wintypes.HWND,wintypes.HWND,wintypes.LPCWSTR,wintypes.LPCWSTR]
USER32.FindWindowExW.restype = wintypes.HWND
USER32.GetDlgCtrlID.argtypes=[wintypes.HWND]
USER32.GetDlgItem.argtypes=[wintypes.HWND,ctypes.c_int]
USER32.GetDlgItem.restype=wintypes.HWND
USER32.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,ctypes.c_void_p]
CALLBACK=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
USER32.EnumChildWindows.argtypes=[wintypes.HWND,CALLBACK,wintypes.LPARAM]


def window_string(reader, hwnd):
    value = ctypes.create_unicode_buffer(256)
    reader(hwnd, value, len(value))
    return value.value


def windows(parent=None):
    result = []
    callback = CALLBACK(lambda hwnd, _: result.append(hwnd) or True)
    USER32.EnumChildWindows(parent,callback,0)
    return result


def belongs(hwnd, process):
    pid = wintypes.DWORD()
    USER32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value == process.pid


def calendar_handle(process):
    roots = windows()
    for hwnd in roots:
        if window_string(USER32.GetClassNameW,hwnd) in ("Progman","WorkerW"):
            roots.extend(windows(hwnd))
    return next((h for h in roots if belongs(h,process) and "Glass Desk Calendar" in window_string(USER32.GetWindowTextW,h)),None)


def native_export(page, process, selector, path):
    page.locator("#settings-toggle").click()
    page.locator(selector).click()
    dialog = wait_for(lambda: next((h for h in windows() if belongs(h,process) and
                                    window_string(USER32.GetClassNameW,h)=="#32770"),None))
    # The file name box in the common Windows Save As dialog is control 1001.
    edit = wait_for(lambda: next((h for h in windows(dialog) if USER32.GetDlgCtrlID(h)==1001
                                  and window_string(USER32.GetClassNameW,h)=="Edit"),None))
    def suggested_name():
        text=ctypes.create_unicode_buffer(1024)
        USER32.SendMessageW(edit,0x000D,len(text),ctypes.cast(text,ctypes.c_void_p))
        return text.value
    wait_for(lambda: path.stem in suggested_name())
    USER32.SendMessageW(USER32.GetDlgItem(dialog,1),0x00F5,0,None)
    try:
        wait_for(lambda: path.is_file() and path.stat().st_size>0, 12)
    except AssertionError:
        log=path.parent/"last-error.txt"
        print("Export status:",page.locator("#feedback").text_content(),flush=True)
        print("Files:",[f.name for f in path.parent.iterdir()],flush=True)
        if log.is_file(): print(log.read_text(encoding="utf-8",errors="replace")[:1200],flush=True)
        raise


def wait_for(probe, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = probe()
            if result:
                return result
        except (OSError, IndexError, ValueError):
            pass
        time.sleep(0.12)
    raise AssertionError("Timed out waiting for " + str(probe))


def start(browser_api, directory):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1",0))
        port = listener.getsockname()[1]
    url = "http://127.0.0.1:" + str(port)
    env = dict(os.environ, GLASS_CALENDAR_TEST_PORT=str(port))
    process = subprocess.Popen([str(EXE), "--data-dir", str(directory)], env=env)
    def endpoint():
        if process.poll() is not None:
            raise AssertionError("App exited during launch with code " + str(process.returncode))
        with urlopen(url + "/json/list", timeout=1) as response:
            targets = json.load(response)
            return url if any(t.get("url")=="https://calendar.example/index.html" for t in targets) else None
    try:
        browser = browser_api.connect_over_cdp(wait_for(endpoint))
        context = browser.contexts[0]
        def calendar_page():
            first=context.pages[0] if context.pages else context.wait_for_event("page")
            first.wait_for_timeout(50)
            return next((p for p in context.pages if p.url=="https://calendar.example/index.html"),None)
        page=wait_for(calendar_page)
        page.locator(".day").first.wait_for()
        return process, page
    except BaseException:
        process.terminate()
        process.wait(timeout=5)
        raise


def quit_app(process, page):
    try:
        for h in windows():
            if belongs(h,process) and window_string(USER32.GetClassNameW,h)=="#32770":
                USER32.SendMessageW(USER32.GetDlgItem(h,2),0x00F5,0,None)
        page.evaluate("chrome.webview.postMessage('quit')")
        process.wait(timeout=12)
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)


def run():
    assert EXE.is_file(), "Build the native Windows application first."
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2L0AAAAASUVORK5CYII=")
    with tempfile.TemporaryDirectory(dir=EXE.parents[1], prefix="smoke-", ignore_cleanup_errors=True) as tmp, sync_playwright() as pw:
        profile = Path(tmp)
        process, page = start(pw.chromium, profile)
        try:
            hwnd = wait_for(lambda: calendar_handle(process))
            def shell_parent():
                parent=USER32.GetParent(hwnd)
                return parent and USER32.FindWindowExW(parent,None,"SHELLDLL_DefView",None)
            wait_for(shell_parent)
            assert page.locator(".day").count() in (28, 35, 42)
            assert page.locator(".day-number").evaluate_all("(ns)=>ns.every(n=>getComputedStyle(n).color==='rgb(20, 41, 59)')")
            assert page.locator(".day:not(.outside)").evaluate_all("(ns)=>ns.every(n=>getComputedStyle(n).borderTopLeftRadius==='8px')")
            assert page.locator(".day.outside").first.get_attribute("data-edges") is not None
            page.locator("#year-toggle").click()
            assert page.locator(".mini-month").count() == 12
            page.locator("#year-toggle").click()
            cell = page.locator(".day.current")
            cell.locator(".day-number").click()
            task = cell.locator("textarea.task").first
            task.fill("Windows desktop smoke test")
            task.click(button="right")
            page.locator('[data-action="edit"]').click()
            page.locator("#note-body").fill("before")
            page.locator("#note-body").press("End")
            page.locator("#note-files").set_input_files({"name":"proof.png","mimeType":"image/png","buffer":png})
            page.locator(".note-text").last.fill("after")
            page.locator("#note-form [type=submit]").click()
            page.locator("#task-note").wait_for(state="hidden")
            page.locator("#settings-toggle").click()
            page.locator("#pin-window").uncheck()
            wait_for(lambda: not shell_parent())
            page.locator("#pin-window").check()
            wait_for(shell_parent)
            page.locator("#language").select_option("en-US")
            assert page.locator("#settings-toggle").inner_text() == "Settings"
            page.locator("#size-width").evaluate("(e) => {e.value=680; e.dispatchEvent(new Event('input',{bubbles:true}));}")
            page.wait_for_function("Math.abs(innerWidth-680)<4")
            page.locator("#size-height").evaluate("(e) => {e.value=510; e.dispatchEvent(new Event('input',{bubbles:true}));}")
            page.wait_for_function("Math.abs(innerHeight-510)<4")
            page.locator("#transparency").evaluate("(e)=>{e.value=85;e.dispatchEvent(new Event('input',{bubbles:true}));}")
            assert page.locator("#transparency-value").inner_text() == "85%"
            assert page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgba(0, 0, 0, 0)"
            print("PASS desktop pin/unpin, monthly/year views, click-to-write, native size, transparency, note with an image.")
        finally:
            quit_app(process, page)
        process, page = start(pw.chromium, profile)
        try:
            task = page.locator(".day.current textarea.task").first
            assert task.input_value() == "Windows desktop smoke test"
            assert abs(page.evaluate("innerWidth")-680)<4
            assert page.locator("#transparency-value").inner_text()=="85%"
            task.click(button="right")
            page.locator('[data-action="edit"]').click()
            page.wait_for_function("document.querySelector('#note-document img')?.naturalWidth===1")
            assert page.locator(".note-text").evaluate_all("(n)=>n.map(e=>e.value)")==["before","after"]
            page.locator("#note-form [type=submit]").click()
            page.locator("#task-note").wait_for(state="hidden")
            print("PASS full restart preserved window, language, task, image, inline text and transparency.")
            name="Calendar_"+date.today().isoformat()
            csv_path, html_path = profile/(name+".csv"),profile/(name+".html")
            native_export(page,process,"#export",csv_path)
            assert "Windows desktop smoke test" in csv_path.read_text(encoding="utf-8-sig")
            native_export(page,process,"#export-illustrated",html_path)
            html=html_path.read_text(encoding="utf-8")
            assert html.index("before") < html.index(base64.b64encode(png).decode()) < html.index("after")
            result=page.evaluate("""async () => {
              const id=CalendarActions.add('2026-10-01','API task');
              CalendarActions.update(id,{done:true});
              const complete=CalendarActions.list().find(entry=>entry.id===id)?.done;
              await CalendarActions.remove(id);
              return complete && !CalendarActions.list().some(entry=>entry.id===id);
            }""")
            assert result
            print("PASS native Save As dialogs, CSV, illustrated HTML with original bytes, and local operations API.")
        finally:
            quit_app(process, page)


if __name__ == "__main__":
    run()
