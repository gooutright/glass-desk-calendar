"""Test the independent Windows project rail and its shared calendar data."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import tempfile
from playwright.sync_api import expect, sync_playwright
from desktop_smoke import EXE, USER32, belongs, start, quit_app, wait_for, window_string, windows, note_editor, wait_closed


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


def region_type(hwnd):
    bounds=wintypes.RECT()
    return USER32.GetWindowRgnBox(wintypes.HWND(hwnd),ctypes.byref(bounds))


def create_project(page,name,color):
    page.locator("#project-toggle").click()
    page.locator("#project-new").click()
    page.locator("#project-name").fill(name)
    page.locator("#project-palette [aria-label='"+color+"']").click()
    page.locator("#project-save").click()
    return page.evaluate("CalendarProjects.active()")


def open_project_visibility(page,project_id):
    toggle=page.locator("#project-toggle")
    if not page.locator("#project-picker").is_visible():
        toggle.click()
    page.locator(f'.project-option[data-project="{project_id}"]').click()
    toggle.click()
    return page.locator("#project-dock-toggle")


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
            tab.wait_for()
            assert dock.locator("#project-tabs[title], #project-tabs [title]").count()==0, \
                "Hovering the project folders must not trigger a second label from the browser"
            assert tab.inner_text()=="Research", "A folded folder must show its project name"
            assert tab.locator("i,svg,img").count()==0, "Folded project tabs are text only"
            assert tab.evaluate("""b=>{
                const name=b.querySelector('.folder-name'), bounds=b.getBoundingClientRect();
                return name && getComputedStyle(name).writingMode==='vertical-rl' &&
                  bounds.height>bounds.width*1.5 && Math.abs(bounds.right-innerWidth)<2;
            }"""), "Project names should form tall, flush-right folder tabs"
            tab.click()
            dock.wait_for_function("document.querySelectorAll('.dock-item').length===2")
            assert dock.locator(".dock-item time").all_text_contents()==["2026-10-01","2027-01-01"]
            wide=wait_for(lambda:rect(hwnd) if rect(hwnd).right-rect(hwnd).left>200 else None)
            assert abs(wide.right-base.right)<=2
            assert tab.evaluate("""b=>{
                const panel=document.getElementById('project-panel').getBoundingClientRect();
                return b.getAttribute('aria-expanded')==='true' && panel.width>160 &&
                  panel.right<=b.getBoundingClientRect().left+2;
            }"""), "The folder must open to the left of the same tab"
            other=dock.get_by_role("button",name="Meetings",exact=True)
            other.click()
            assert dock.locator(".dock-item span").all_text_contents()==["Agenda"]
            other.click()
            assert dock.locator("#project-panel").is_hidden()
            tab.click()
            dock.locator(".dock-item").first.click()
            editor=note_editor(main,ids[0])
            assert editor.locator("#note-title").input_value()=="Report"
            assert editor.locator("#note-project").input_value()==a
            editor.locator("#note-project").select_option(b)
            editor.locator("#note-cancel").click()
            wait_closed(main,editor)
            assert main.evaluate("(id)=>CalendarActions.list().find(e=>e.id===id).projectId",ids[0])==a
            cell=main.locator(".day[data-date='2026-10-01']")
            assert cell.locator(".day-number + .holiday-mark").is_visible()
            assert cell.locator(".holiday-name").inner_text()
            assert main.locator(".day .weekend-mark").count()==0
            assert main.locator(".weekdays span").all_text_contents()[0]=="周日"
            cell.locator("textarea").first.click(button="right")
            main.locator('[data-action="edit"]').click()
            editor=note_editor(main,ids[0])
            editor.locator("#note-project").select_option(b)
            editor.locator("#note-form [type=submit]").click()
            wait_closed(main,editor)
            assert cell.locator(".check").first.evaluate("(e)=>getComputedStyle(e).backgroundColor")=="rgb(181, 102, 119)"
            cell.locator(".check").first.check()
            assert main.evaluate("(id)=>CalendarActions.list().find(e=>e.id===id).done",ids[0])
            tab.click()
            dock.wait_for_function("document.querySelectorAll('.dock-item').length===1")
            assert "References" in dock.locator(".dock-item").inner_text()
            dock.locator(".dock-close").click()
            wait_for(lambda:abs((rect(hwnd).right-rect(hwnd).left)-(base.right-base.left))<3)
            print("PASS two native windows, right-edge expansion, cross-month groups, colors, cancel/reassign, completion, inline holidays, weekend headers.")

            tab.click()
            panel=dock.locator("#project-panel")
            expect(panel).to_be_visible()
            visibility=open_project_visibility(main,b)
            visible_tabs=dock.locator(".dock-tab:visible")
            unassigned=dock.locator('.dock-tab[data-project-tab=""]')
            visibility.click()
            expect(other).to_be_hidden()
            expect(tab).to_be_visible()
            expect(unassigned).to_be_visible()
            expect(panel.locator(".dock-item span")).to_have_text("References")
            expect(visibility).to_have_text("显示此项目侧边便签")
            visibility.click()
            expect(other).to_be_visible()
            expect(panel).to_be_visible()
            visibility.click()

            visibility=open_project_visibility(main,a)
            expect(visibility).to_have_text("隐藏此项目侧边便签")
            visibility.click()
            expect(panel).to_be_hidden()
            expect(unassigned).to_be_visible()
            visibility=open_project_visibility(main,"")
            visibility.click()
            expect(visible_tabs).to_have_count(0)
            # NULLREGION means no part of the native window can cover desktop clicks.
            wait_for(lambda:region_type(hwnd)==1,5)
            main.evaluate("([id,p])=>CalendarActions.update(id,{projectId:p})",[ids[3],b])
            visibility.click()
            expect(unassigned).to_be_visible()
            expect(visible_tabs).to_have_count(1)
            wait_for(lambda:region_type(hwnd)>1,5)
            main.evaluate("(id)=>CalendarActions.update(id,{projectId:''})",ids[3])
            open_project_visibility(main,b)
            main.evaluate("localStorage.setItem('desktop-calendar.dock-hidden.v1','1')")
            print("PASS hiding one project leaves other projects open, and Unassigned can be toggled independently even when empty.")
        finally:
            quit_app(process,main)
        process,page=start(pw.chromium,profile)
        try:
            assert page.evaluate("CalendarProjects.active()")==b
            assert page.evaluate("CalendarActions.list().filter(e=>e.projectId).length")==3
            print("PASS projects and assignments survive a full restart; unassigned notes are retained.")
            dock=wait_for(lambda:next((p for p in page.context.pages if p.url.endswith('/dock.html')),None))
            visible_tabs=dock.locator(".dock-tab:visible")
            expect(visible_tabs).to_have_count(1)
            expect(dock.locator('.dock-tab[data-project-tab=""]')).to_be_visible()
            hwnd=wait_for(lambda:dock_window(process))
            wait_for(lambda:region_type(hwnd)>1,5)
            page.locator("#project-toggle").click()
            visibility=page.locator("#project-dock-toggle")
            expect(visibility).to_have_text("显示此项目侧边便签")
            visibility.click()
            expect(dock.get_by_role("button",name="Meetings",exact=True)).to_be_visible()
            expect(dock.get_by_role("button",name="Research",exact=True)).to_be_hidden()
            open_project_visibility(page,a).click()
            expect(visible_tabs).to_have_count(3)
            page.locator("#project-new").click()
            expect(visibility).to_be_hidden()
            page.locator("#project-toggle").click()
            print("PASS each project's visibility survives restart and restoring a project leaves the other hidden projects alone.")
            # A preexisting, long project list should fit the desktop and remain reachable by keyboard.
            page.evaluate("""()=>{
              const key='desktop-calendar.projects.v1', projects=JSON.parse(localStorage.getItem(key));
              for(let i=0;i<12;i++) projects.push({id:'extra-'+i,name:'Design 项目归档资料 '+i,color:'#'+(0x708090+i).toString(16)});
              localStorage.setItem(key,JSON.stringify(projects));
            }""")
            last=dock.get_by_role("button",name="Design 项目归档资料 11",exact=True)
            last.wait_for(state="attached")
            dock.locator("#project-tabs").hover()
            dock.mouse.wheel(0,380)
            dock.wait_for_function("document.getElementById('project-tabs').scrollTop>0")
            first=dock.locator(".dock-tab").first
            first.focus()
            first.press("End")
            assert last.evaluate("""b=>document.activeElement===b && b.parentElement.scrollTop>0 &&
              b.querySelector('.folder-name').scrollHeight>b.querySelector('.folder-name').clientHeight &&
              b.getBoundingClientRect().bottom<=innerHeight+1""")
            last.press("Enter")
            assert dock.locator("#project-panel").is_visible()
            last.press("Escape")
            assert dock.locator("#project-panel").is_hidden() and last.evaluate("b=>document.activeElement===b")
            print("PASS vertical folder labels, project switching, long names, scrolling and keyboard collapse.")
        finally:
            quit_app(process,page)


if __name__=="__main__":
    run()
