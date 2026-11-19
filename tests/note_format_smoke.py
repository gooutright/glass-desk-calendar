"""Exercise independent fonts and rich-note formatting in the shipping WebView2 editor."""
from pathlib import Path
from datetime import date
import base64
import tempfile
from playwright.sync_api import sync_playwright
from desktop_smoke import EXE, start, quit_app, native_export


def slider(page, selector, value):
    page.locator(selector).evaluate("""(e,v)=>{e.value=v;
      for(const type of ['input','change'])e.dispatchEvent(new Event(type,{bubbles:true}));}""",value)


def open_note(page):
    page.locator(".day.current .task").first.click(button="right")
    page.locator('[data-action="edit"]').click()


def run():
    with tempfile.TemporaryDirectory(dir=EXE.parents[1],ignore_cleanup_errors=True) as tmp, sync_playwright() as pw:
        profile=Path(tmp)
        proc,page=start(pw.chromium,profile)
        try:
            page.evaluate("""() => {
              localStorage.setItem('desktop-calendar-sketch.size.v1',JSON.stringify({font:17}));
              CalendarActions.add(document.querySelector('.day.current').dataset.date,'Formatting');
            }""")
            page.reload()
            page.locator("#settings-toggle").click()
            assert page.locator("#size-calendar-font").count()==1 and page.locator("#size-note-font").count()==1, "Two independent font settings are required"
            assert page.locator("#size-note-font").input_value()=="17"
            slider(page,"#size-calendar-font",23)
            slider(page,"#size-note-font",19)
            assert page.locator(".day-number").first.evaluate("e=>getComputedStyle(e).fontSize")=="23px"
            assert page.locator(".day.current .task").first.evaluate("e=>getComputedStyle(e).fontSize")=="19px"
            page.locator("#settings-close").click()
            open_note(page)
            assert page.locator("#task-note").evaluate("""n=>{
              const box=e=>e.getBoundingClientRect(), d=box(document.querySelector('.day.current')), r=box(n);
              const body=box(n.querySelector('#note-document')),tools=box(n.querySelector('#note-format')),actions=box(n.querySelector('.note-actions'));
              return r.width/d.width>2.9 && r.width/d.width<3.2 && r.height/d.height>2.9 && r.height/d.height<3.2 &&
              tools.top>=body.bottom-1 && actions.top>=tools.bottom-1 && r.left>=0 && r.bottom<=innerHeight;
            }"""), "Three by three calendar cells with the tools between text and actions"
            body=page.locator("#note-body")
            body.fill("前重点后")
            body.press("Home")
            body.press("ArrowRight")
            body.press("Shift+ArrowRight")
            body.press("Shift+ArrowRight")
            page.locator("#format-size").select_option("24px")
            page.locator("#format-bold").click()
            page.locator("#format-underline").click()
            for selector,color in [("#format-color","#ac3245"),("#format-highlight","#ffe681")]:
                page.locator(selector).fill(color)
                page.locator(selector).dispatch_event("change")
            page.locator("#note-save").click()
            page.locator("#task-note").wait_for(state="hidden")
            record=page.evaluate("CalendarActions.list()[0]")
            assert record["note"]=="前重点后",record
            span=record["noteStyles"]
            assert len(span)==1 and (span[0]["start"],span[0]["end"])==(1,3),span
            assert span[0]["attributes"]==dict(size="24px",bold=True,underline=True,color="#ac3245",background="#ffe681"),span
            open_note(page)
            assert body.locator("strong").inner_text()=="重点"
            body.press("Control+End")
            page.locator("#format-bold").click()
            page.keyboard.insert_text("新字")
            page.locator("#note-cancel").click()
            assert page.evaluate("CalendarActions.list()[0].note")=="前重点后"
            open_note(page)
            body.press("Control+End")
            page.locator("#format-bold").click()
            page.keyboard.insert_text("新字")
            page.locator("#note-save").click()
            page.locator("#task-note").wait_for(state="hidden")
            current=page.evaluate("CalendarActions.list()[0]")
            assert current["note"]=="前重点后新字" and current["noteStyles"][-1]["attributes"]=={"bold":True},current
        finally:
            quit_app(proc,page)
        proc,page=start(pw.chromium,profile)
        try:
            open_note(page)
            assert page.locator("#note-body").inner_text()=="前重点后新字"
            assert page.locator("#format-bold").get_attribute("title")
            body=page.locator("#note-body")
            body.press("Control+Home")
            body.press("ArrowRight")
            body.press("ArrowRight")
            png64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2L0AAAAASUVORK5CYII="
            page.locator("#note-files").set_input_files({"name":"mark.png","mimeType":"image/png","buffer":base64.b64decode(png64)})
            page.wait_for_function("document.querySelector('#note-document img')?.naturalWidth===1")
            page.locator("#note-save").click()
            page.locator("#task-note").wait_for(state="hidden")
            marked=page.evaluate("CalendarActions.list()[0]")
            assert marked["noteImages"][0]["at"]==2 and marked["noteStyles"]==current["noteStyles"]
            open_note(page)
            page.locator(".note-photo-view").click()
            page.locator("#photo-close").click()
            page.locator(".note-photo-remove").click()
            assert page.locator(".note-photo").count()==0
            page.locator("#note-cancel").click()
            page.locator("#settings-toggle").click()
            assert page.locator("#size-calendar-font").input_value()=="23" and page.locator("#size-note-font").input_value()=="19"
            page.locator("#language").select_option("en-US")
            page.locator("#settings-close").click()
            target=profile/("Calendar_"+date.today().isoformat()+".html")
            native_export(page,proc,"#export-illustrated",target)
            exported=target.read_text(encoding="utf-8")
            assert all(s in exported for s in ["#ac3245","#ffe681","24px","underline","font-weight"]),exported[-500:]
            assert exported.index(">重<") < exported.index(png64) < exported.index(">点<")
            print("PASS independent settings, legacy size, 3x3 editor, bottom toolbar, selection and insertion styles, cancel, restart, photo in highlighted text and formatted HTML.")
        finally:
            quit_app(proc,page)


if __name__=="__main__":
    run()
