"""Windows hit-testing, dragging, unsaved editing and independent application input."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import tempfile
import time
import tkinter as tk
from playwright.sync_api import sync_playwright
from desktop_smoke import (EXE, USER32, belongs, calendar_handle, note_editor, quit_app,
                           start, wait_closed, wait_for, window_string, windows)
from project_notes_smoke import create_project, dock_window, rect

USER32.WindowFromPoint.argtypes=[wintypes.POINT]
USER32.WindowFromPoint.restype=wintypes.HWND
USER32.SetWindowPos.argtypes=[wintypes.HWND,wintypes.HWND,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_uint]


def lift(hwnd):
    # Bring only the disposable test window forward. Restore normal stacking before interaction.
    for after in (-1,-2):
        USER32.SetWindowPos(hwnd,after,0,0,0,0,0x13)
    time.sleep(.15)


def hits(hwnd,x,y):
    hit=USER32.WindowFromPoint(wintypes.POINT(x,y))
    return hit==hwnd or USER32.IsChild(hwnd,hit)


def gesture(hwnd,x,y,dx=0,dy=0,pump=None):
    assert hits(hwnd,x,y), "The intended window must own the click before sending input"
    USER32.SetCursorPos(x,y)
    time.sleep(.08)
    if pump:pump()
    USER32.mouse_event(2,0,0,0,0)
    try:
        time.sleep(.12)
        if pump:pump()
        if dx or dy:
            for step in range(1,19):
                USER32.SetCursorPos(x+round(dx*step/18),y+round(dy*step/18))
                time.sleep(.015)
    finally:
        USER32.mouse_event(4,0,0,0,0)
    time.sleep(.18)
    if pump:pump()


def tab_center(dock,rail,tab):
    item=tab.bounding_box()
    box=rect(rail)
    scale=dock.evaluate("devicePixelRatio")
    return (round(box.left+(item["x"]+item["width"]*.65)*scale),
            round(box.top+(item["y"]+item["height"]*.5)*scale))


def concurrent_edits(main):
    ids=main.evaluate("""()=>['First','Second'].map(name=>
       CalendarActions.add(document.querySelector('.day.current').dataset.date,name))""")
    def edit(record_id):
        main.locator('.entry[data-id="'+record_id+'"] .task').click(button="right")
        main.locator('[data-action=edit]').click()
        return note_editor(main,record_id)
    first,second=map(edit,ids)
    first.locator("#note-body").fill("First body")
    second.locator("#note-body").fill("Second body")
    assert edit(ids[0])==first, "Reopening an edited record must reuse its draft"
    main.evaluate("id=>CalendarActions.update(id,{done:true})",ids[0])
    first.evaluate("document.getElementById('note-form').requestSubmit()")
    second.evaluate("document.getElementById('note-form').requestSubmit()")
    wait_closed(main,first)
    wait_closed(main,second)
    state=main.evaluate("ids=>ids.map(id=>CalendarActions.list().find(r=>r.id===id))",ids)
    assert [r["note"] for r in state]==["First body","Second body"] and state[0]["done"]
    first=edit(ids[0])
    first.locator("#note-title").fill("Editor title")
    main.evaluate("id=>CalendarActions.update(id,{text:'Calendar title'})",ids[0])
    first.locator("#note-save").click()
    first.wait_for_function("document.getElementById('note-message').textContent.length>0")
    assert first.locator("#note-title").input_value()=="Editor title"
    assert main.evaluate("id=>CalendarActions.list().find(r=>r.id===id).text",ids[0])=="Calendar title"
    first.locator("#note-cancel").click()
    wait_closed(main,first)
    print("PASS two concurrent notes save independently; reopening preserves a draft; conflicting title edits remain recoverable.")


def test_windows(profile,pw):
    process,main=start(pw.chromium,profile)
    helper=None
    try:
        hwnd=wait_for(lambda:calendar_handle(process))
        main.evaluate("chrome.webview.postMessage('width=640');chrome.webview.postMessage('height=500')")
        main.wait_for_function("Math.abs(innerWidth-640)<3 && Math.abs(innerHeight-500)<3")
        # Position this synthetic calendar in the middle, with room on both sides.
        USER32.SetWindowPos(hwnd,0,570,280,0,0,0x11)
        frame=rect(hwnd)
        helper=tk.Tk()
        helper.overrideredirect(True)
        helper.geometry(f"{frame.right-frame.left+12}x{frame.bottom-frame.top+12}+{frame.left-6}+{frame.top-6}")
        helper.configure(bg="#112233")
        clicks=[]
        helper.bind("<Button-1>",lambda event:clicks.append((event.x_root,event.y_root)))
        helper.update()
        helper_hwnd=USER32.GetParent(helper.winfo_id()) or helper.winfo_id()
        lift(helper_hwnd)
        lift(hwnd)
        corners=[(x,y) for x in (frame.left+1,frame.right-2) for y in (frame.top+1,frame.bottom-2)]
        assert all(hits(helper_hwnd,x,y) for x,y in corners), "All four transparent corners must belong to the window behind"
        assert hits(hwnd,frame.left+40,frame.top+10)
        note_id=main.evaluate("CalendarActions.add(document.querySelector('.day.current').dataset.date,'Floating draft')")
        main.locator(".day.current .task").first.click(button="right")
        main.locator('[data-action=edit]').click()
        editor=note_editor(main,note_id)
        note_hwnd=wait_for(lambda:next((h for h in windows() if belongs(h,process) and
            "Calendar Note" in window_string(USER32.GetWindowTextW,h)),None))
        assert not USER32.GetParent(note_hwnd) and not(USER32.GetWindowLongW(note_hwnd,-20)&8)
        assert not main.locator("dialog:modal").count()
        editor.locator("#note-body").fill("This is an unsaved draft.")
        grip=editor.locator("#note-date").bounding_box()
        scale=editor.evaluate("devicePixelRatio")
        start_box=rect(note_hwnd)
        lift(note_hwnd)
        x=start_box.left+round((grip["x"]+15)*scale)
        y=start_box.top+round((grip["y"]+grip["height"]/2)*scale)
        destination=max(12,frame.left-(start_box.right-start_box.left)-40)
        gesture(note_hwnd,x,y,destination-start_box.left,20)
        moved=rect(note_hwnd)
        assert moved.right<frame.left and abs(moved.left-destination)<12, (start_box.left,moved.left,destination)
        # A genuine button press in a different process' window through the rounded corner.
        gesture(helper_hwnd,*corners[0],pump=helper.update)
        def received_click():
            helper.update()
            return clicks and USER32.IsWindowEnabled(helper_hwnd)
        wait_for(received_click,4)
        main.locator("#next").click()
        assert editor.locator("#note-body").inner_text()=="This is an unsaved draft."
        editor.locator("#note-save").click()
        wait_closed(main,editor)
        assert main.evaluate("id=>CalendarActions.list().find(r=>r.id===id).note",note_id)=="This is an unsaved draft."
        helper.destroy();helper=None
        main.locator("#today").click()
        concurrent_edits(main)

        rail=wait_for(lambda:dock_window(process))
        def get_rail():
            main.wait_for_timeout(50)
            return next((page for page in main.context.pages if page.url.endswith("/dock.html")),None)
        dock=wait_for(get_rail)
        create_project(main,"Stationary folder","#368575")
        other=dock.get_by_role("button",name="Stationary folder",exact=True)
        tab=dock.locator('.dock-tab[data-project-tab=""]')
        other.wait_for()
        tab.wait_for()
        dock.evaluate("""()=>{
          window.railEvents=[];
          for(const type of ['pointerdown','pointerup','click','lostpointercapture'])
            document.addEventListener(type,e=>railEvents.push([type,e.screenY,e.clientY,e.target.className]),true);
        }""")
        lift(rail)
        # The installed calendar may have its own tab at precisely this coordinate.
        # Put the disposable rail above it for the physical drag.
        USER32.SetWindowPos(rail,-1,0,0,0,0,0x13)
        wait_for(lambda:hits(rail,*tab_center(dock,rail,tab)))
        initial=tab_center(dock,rail,tab)
        stationary=tab_center(dock,rail,other)
        gesture(rail,*initial,0,-125)
        after=tab_center(dock,rail,tab)
        assert abs(after[0]-initial[0])<2 and abs(initial[1]-after[1]-125)<10, (initial,after)
        assert tab_center(dock,rail,other)==stationary, "Dragging one project must leave the other at its original screen coordinate"
        assert not hits(rail,initial[0],initial[1]), "The vacated gap must allow desktop clicks"
        assert tab.evaluate("""t=>{
          const lip=t.querySelector('.folder-lip');
          return getComputedStyle(t,'::before').top===getComputedStyle(t,'::after').top &&
              getComputedStyle(lip).top===getComputedStyle(t,'::after').top &&
              getComputedStyle(lip).filter.includes('drop-shadow');
        }"""), "The two folder faces share a top edge and the projecting lip casts a local shadow"
        assert tab.get_attribute("aria-expanded")=="false"
        assert tab.locator("i,svg,img").count()==0
        gesture(rail,*after)
        try:
            dock.locator("#project-panel").wait_for(timeout=3500)
        except Exception:
            print("Rail input",dock.evaluate("""()=>({events:railEvents,expanded:document.querySelector('.dock-tab').getAttribute('aria-expanded'),
              viewport:[innerWidth,innerHeight],bounds:document.querySelector('.dock-tab').getBoundingClientRect().toJSON()})"""),flush=True)
            raise
        tab.click()
        dock.locator("#project-panel").wait_for(state="hidden")
        wait_for(lambda:rect(rail).right-rect(rail).left<85 and hits(rail,*stationary),5)
        print("PASS four corners pass physical clicks; unowned note drags outside calendar; another process receives click; navigating and saving keep draft; rail drags without opening.")
        gesture(rail,*stationary,0,95)
        assert tab_center(dock,rail,tab)==after
        moved_other=tab_center(dock,rail,other)
        assert abs(moved_other[1]-stationary[1]-95)<10
        return after,moved_other
    finally:
        if helper: helper.destroy()
        quit_app(process,main)


def run():
    USER32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    cursor=wintypes.POINT()
    USER32.GetCursorPos(ctypes.byref(cursor))
    try:
        with tempfile.TemporaryDirectory(dir=EXE.parents[1],prefix="floating-test-",ignore_cleanup_errors=True) as tmp, sync_playwright() as pw:
            profile=Path(tmp)
            first,second=test_windows(profile,pw)
            process,main=start(pw.chromium,profile)
            try:
                rail=wait_for(lambda:dock_window(process))
                main.wait_for_function("document.readyState==='complete'")
                def restored():
                    main.wait_for_timeout(50)
                    dock=next((p for p in main.context.pages if p.url.endswith("/dock.html")),None)
                    if not dock:return False
                    a=dock.locator('.dock-tab[data-project-tab=""]')
                    b=dock.get_by_role("button",name="Stationary folder",exact=True)
                    return a.is_visible() and b.is_visible() and tab_center(dock,rail,a)==first and tab_center(dock,rail,b)==second
                wait_for(restored)
                print("PASS both independent folder positions survive a full application restart.")
            finally:
                quit_app(process,main)
    finally:
        USER32.SetCursorPos(cursor.x,cursor.y)


if __name__=="__main__":
    run()
