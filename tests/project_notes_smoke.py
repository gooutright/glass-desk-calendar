"""Test the independent Windows project rail and its shared calendar data."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright
from desktop_smoke import EXE, USER32, belongs, start, quit_app, wait_for, window_string, windows


def dock_window(process):
    roots=windows()
    for hwnd in list(roots):
        if window_string(USER32.GetClassNameW,hwnd) in ("WorkerW","Progman"):
            roots.extend(windows(hwnd))
    return next((h for h in roots if belongs(h,process) and "Project Notes" in window_string(USER32.GetWindowTextW,h)),None)


def rect(hwnd):
    bounds=wintypes.RECT()
    USER32.GetWindowRect(wintypes.HWND(hwnd),ctypes.byref(bounds))
    return bounds


def create_project(page,name,color):
    page.locator("#project-toggle").click()
    page.locator("#project-new").click()
    page.locator("#project-name").fill(name)
    page.locator("#project-palette [aria-label='"+color+"']").click()
    page.locator("#project-save").click()
    return page.evaluate("CalendarProjects.active()")


def run():
    with tempfile.TemporaryDirectory(dir=EXE.parents[1],prefix="project-test-",ignore_cleanup_errors=True) as tmp, sync_playwright() as pw:
        profile=Path(tmp)
        process,main=start(pw.chromium,profile)
        try:
            def dock_page():
                main.wait_for_timeout(50)
                return next((tab for tab in main.context.pages if tab.url.endswith("/dock.html")),None)
            dock=wait_for(dock_page)
            hwnd=wait_for(lambda:dock_window(process))
            base=rect(hwnd)
            assert base.right-base.left<85
            a=create_project(main,"Research","#368575")
            b=create_project(main,"Meetings","#b56677")
            assert a!=b
            ids=main.evaluate("""([a,b])=>[
              CalendarActions.add('2026-10-01','Report',a),
              CalendarActions.add('2027-01-01','References',a),
              CalendarActions.add('2026-10-01','Agenda',b),
              CalendarActions.add('2026-10-02','Old unassigned note','')]""",[a,b])
            tab=dock.locator(".dock-tab[aria-label=Research]")
            tab.click()
            dock.wait_for_function("document.querySelectorAll('.dock-item').length===2")
            assert dock.locator(".dock-item time").all_text_contents()==["2026-10-01","2027-01-01"]
            wide=wait_for(lambda:rect(hwnd) if rect(hwnd).right-rect(hwnd).left>200 else None)
            assert abs(wide.right-base.right)<=2
            dock.locator(".dock-item").first.click()
            main.locator("#task-note[open]").wait_for()
            assert main.locator("#note-title").input_value()=="Report"
            assert main.locator("#note-project").input_value()==a
            main.locator("#note-project").select_option(b)
            main.locator("#note-cancel").click()
            assert main.evaluate("(id)=>CalendarActions.list().find(e=>e.id===id).projectId",ids[0])==a
            cell=main.locator(".day[data-date='2026-10-01']")
            assert cell.locator(".day-number + .holiday-mark").is_visible()
            assert cell.locator(".holiday-name").inner_text()
            assert main.locator(".day .weekend-mark").count()==0
            assert main.locator(".weekdays span").all_text_contents()[0]=="周日"
            cell.locator("textarea").first.click(button="right")
            main.locator('[data-action="edit"]').click()
            main.locator("#note-project").select_option(b)
            main.locator("#note-form [type=submit]").click()
            main.locator("#task-note").wait_for(state="hidden")
            assert cell.locator(".check").first.evaluate("(e)=>getComputedStyle(e).backgroundColor")=="rgb(181, 102, 119)"
            cell.locator(".check").first.check()
            assert main.evaluate("(id)=>CalendarActions.list().find(e=>e.id===id).done",ids[0])
            tab.click()
            dock.wait_for_function("document.querySelectorAll('.dock-item').length===1")
            assert "References" in dock.locator(".dock-item").inner_text()
            dock.locator(".dock-close").click()
            wait_for(lambda:abs((rect(hwnd).right-rect(hwnd).left)-(base.right-base.left))<3)
            print("PASS two native windows, right-edge expansion, cross-month groups, colors, cancel/reassign, completion, inline holidays, weekend headers.")
        finally:
            quit_app(process,main)
        process,page=start(pw.chromium,profile)
        try:
            assert page.evaluate("CalendarProjects.active()")==b
            assert page.evaluate("CalendarActions.list().filter(e=>e.projectId).length")==3
            print("PASS projects and assignments survive a full restart; unassigned notes are retained.")
        finally:
            quit_app(process,page)


if __name__=="__main__":
    run()
