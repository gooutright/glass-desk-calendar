"""Use physical Windows clicks to exercise project folders against overlapping windows."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import tempfile
import tkinter as tk
import unittest

from playwright.sync_api import sync_playwright
from desktop_smoke import EXE, USER32, calendar_handle, note_editor, quit_app, start, wait_closed, wait_for
from floating_notes_smoke import gesture, hits, lift, tab_center
from project_notes_smoke import dock_window, rect


def move_to_secondary_if_available(hwnd):
    screens=[]
    callback_type=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HANDLE,wintypes.HDC,
                                     ctypes.POINTER(wintypes.RECT),wintypes.LPARAM)
    def collect(_monitor,_dc,area,_data):
        r=area.contents
        screens.append((r.left,r.top,r.right,r.bottom))
        return True
    USER32.EnumDisplayMonitors(None,None,callback_type(collect),0)
    for left,top,right,bottom in screens:
        if not (left<=0<right and top<=0<bottom):
            USER32.SetWindowPos(hwnd,0,left+32,top+40,min(740,right-left-64),
                                min(540,bottom-top-80),0x14)
            return


class ProjectLayerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        USER32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))

    def setUp(self):
        cursor=wintypes.POINT()
        USER32.GetCursorPos(ctypes.byref(cursor))
        self.addCleanup(USER32.SetCursorPos,cursor.x,cursor.y)
        profile=tempfile.TemporaryDirectory(dir=EXE.parents[1],prefix="folder-layer-",ignore_cleanup_errors=True)
        self.addCleanup(profile.cleanup)
        self.pw=sync_playwright().start()
        self.addCleanup(self.pw.stop)
        self.profile=Path(profile.name)
        self.start_calendar()
        self.record=self.main.evaluate("CalendarActions.add('2027-01-02','Folder click test','')")

    def start_calendar(self):
        process,main=start(self.pw.chromium,self.profile)
        self.main=main
        def stop():
            if process.poll() is None:quit_app(process,main)
        self.stop_calendar=stop
        self.addCleanup(self.stop_calendar)
        self.hwnd=wait_for(lambda:calendar_handle(process))
        self.rail=wait_for(lambda:dock_window(process))
        def dock_page():
            self.main.wait_for_timeout(30)
            return next((p for p in self.main.context.pages if p.url.endswith('/dock.html')),None)
        self.dock=wait_for(dock_page)
        self.tab=self.dock.locator(".dock-tab").first
        self.tab.wait_for()

    def pin(self,enabled):
        self.main.locator("#settings-toggle").click()
        self.main.locator("#pin-window").set_checked(enabled)
        self.main.locator("#settings-close").click()

    def open_list(self):
        gesture(self.rail,*tab_center(self.dock,self.rail,self.tab))
        self.dock.wait_for_function("innerWidth>200 && document.querySelector('.dock-item') && !document.querySelector('#project-panel').hidden")
        item=self.dock.locator(".dock-item").filter(has_text="Folder click test")
        item.wait_for()
        return item

    def cover_right_edge(self):
        right=rect(self.rail).right
        _,y=tab_center(self.dock,self.rail,self.tab)
        helper=tk.Tk()
        self.addCleanup(helper.destroy)
        helper.title("Folder input test")
        helper.overrideredirect(True)
        helper.geometry("620x410")
        helper.update()
        owner=USER32.GetParent(helper.winfo_id()) or helper.winfo_id()
        USER32.SetWindowPos(owner,0,right-620,y-195,620,410,0x14)
        def activate():
            helper.lift()
            helper.focus_force()
            helper.update()
            lift(owner)
            # A real click well to the left of both the folded tab and the open panel.
            gesture(owner,right-565,y,pump=helper.update)
            wait_for(lambda:USER32.GetForegroundWindow()==owner,3)
        activate()
        return owner,activate

    def test_floating_folder_over_its_own_calendar(self):
        box=rect(self.hwnd)
        right=rect(self.rail).right
        _,y=tab_center(self.dock,self.rail,self.tab)
        USER32.SetWindowPos(self.hwnd,0,right-(box.right-box.left),max(0,y-(box.bottom-box.top)//2),0,0,0x11)
        lift(self.hwnd)
        today=self.main.locator("#today")
        wait_for(lambda:hits(self.hwnd,*tab_center(self.main,self.hwnd,today)),5)
        gesture(self.hwnd,*tab_center(self.main,self.hwnd,today))
        self.assertTrue(hits(self.rail,*tab_center(self.dock,self.rail,self.tab)),
                        "The activated calendar intercepts its own folder click")
        item=self.open_list()
        gesture(self.rail,*tab_center(self.dock,self.rail,item))
        editor=note_editor(self.main,self.record)
        self.assertEqual(editor.locator("#note-title").input_value(),"Folder click test")
        editor.locator("#note-cancel").click()
        wait_closed(self.main,editor)

    def test_pinned_folder_over_another_application(self):
        self.pin(True)
        other,activate=self.cover_right_edge()
        point=tab_center(self.dock,self.rail,self.tab)
        self.assertTrue(hits(self.rail,*point),"Another application intercepts the pinned folder click")
        self.assertTrue(hits(other,point[0],point[1]-150),"The gap above a folder must reach the other window")
        self.assertFalse(USER32.GetWindowLongW(self.hwnd,-20)&8,"Pinning must leave the calendar on the desktop layer")
        item=self.open_list()
        activate()
        gesture(self.rail,*tab_center(self.dock,self.rail,item))
        editor=note_editor(self.main,self.record)
        self.assertEqual(editor.locator("#note-title").input_value(),"Folder click test")
        editor.locator("#note-cancel").click()
        wait_closed(self.main,editor)
        self.pin(False)
        activate()
        self.assertTrue(hits(other,*point),"Unpinning must restore ordinary folder stacking")

    def test_pinned_restart_and_minimized_calendar(self):
        move_to_secondary_if_available(self.hwnd)
        self.pin(True)
        self.stop_calendar()
        self.start_calendar()
        _,activate=self.cover_right_edge()
        point=tab_center(self.dock,self.rail,self.tab)
        right=rect(self.rail).right
        self.assertTrue(hits(self.rail,*point),"The saved pin must apply to the folder on startup")
        USER32.ShowWindow(self.hwnd,6)  # Windows may minimize the calendar during Show Desktop.
        activate()
        self.assertTrue(hits(self.rail,*point),"Minimizing the calendar must keep its pinned folder available")
        item=self.open_list()
        self.assertEqual(rect(self.rail).right,right,"An expanded folder must stay on the screen where it was clicked")
        gesture(self.rail,*tab_center(self.dock,self.rail,item))
        editor=note_editor(self.main,self.record)
        self.assertEqual(editor.locator("#note-title").input_value(),"Folder click test")
        screen_area="() => [screen.availLeft,screen.availTop,screen.availWidth,screen.availHeight]"
        self.assertEqual(editor.evaluate(screen_area),self.dock.evaluate(screen_area),
                         "The opened note must appear on the folder's monitor")


if __name__=="__main__":
    unittest.main(verbosity=2)
