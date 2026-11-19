"""Measure WebView2 frame intervals and renderer work under a repeatable calendar workload."""
import argparse
import ctypes
import json
import statistics
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from desktop_smoke import EXE, USER32, calendar_handle, quit_app, start, wait_for


def measure(page, session, kind):
    def metrics():
        return {m["name"]: m["value"] for m in session.send("Performance.getMetrics")["metrics"]}
    before = metrics()
    timings = page.evaluate("""async kind => {
      const panel=document.querySelector('.calendar'), area=document.querySelector('.day.current textarea');
      const width=innerWidth, height=innerHeight;
      const frames=[], handlers=[];
      let last=null;
      for (let i=0;i<100;i++) {
        const stamp=await new Promise(requestAnimationFrame);
        if (last!==null) frames.push(stamp-last);
        last=stamp;
        const begin=performance.now();
        if(kind==='hover') {
          panel.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:(i*47)%width,clientY:(i*17)%height}));
        } else if(kind==='resize') {
          chrome.webview.postMessage('width='+(1050+(i%30)*4));
        } else {
          area.value='Typing sample '+i;
          area.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
        }
        handlers.push(performance.now()-begin);
      }
      return {frames,handlers};
    }""",kind)
    after = metrics()
    times = sorted(timings["frames"])
    return dict(median_ms=round(statistics.median(times),2), p95_ms=round(times[int(.95*len(times))],2),
                over_33ms=sum(v>33.34 for v in times), frames=len(times),
                avg_fps=round(1000/statistics.mean(times),1),
                handler_ms=round(sum(timings["handlers"]),1),
                layouts=round(after["LayoutCount"]-before["LayoutCount"]),
                style_layout_ms=round(1000*sum(after[k]-before[k] for k in ("LayoutDuration","RecalcStyleDuration")),1))


def run(rounds):
    with tempfile.TemporaryDirectory(dir=EXE.parents[1],prefix="frame-test-",ignore_cleanup_errors=True) as tmp, sync_playwright() as pw:
        process,page=start(pw.chromium,Path(tmp))
        try:
            page.evaluate("chrome.webview.postMessage('float')")
            hwnd=wait_for(lambda: calendar_handle(process))
            # Keep only the disposable test window visible so occlusion cannot throttle the renderer.
            USER32.SetWindowPos(ctypes.c_void_p(hwnd),ctypes.c_void_p(-1),0,0,0,0,0x13)
            page.evaluate("""() => {
              const days=[...document.querySelectorAll('.day')].map(n=>n.dataset.date);
              const entries=Array.from({length:140},(_,i)=>({id:'frame-'+i,date:days[i%days.length],text:'Test entry '+i,done:false}));
              localStorage.setItem('desktop-calendar-sketch.records.v1',JSON.stringify(entries));
            }""")
            page.reload()
            session=page.context.new_cdp_session(page)
            session.send("Performance.enable")
            for n in range(rounds):
                result={}
                for kind in ("hover","typing","resize"):
                    page.evaluate("chrome.webview.postMessage('width=1140');chrome.webview.postMessage('height=725')")
                    page.wait_for_function("Math.abs(innerWidth-1140)<3 && Math.abs(innerHeight-725)<3")
                    page.wait_for_timeout(350)
                    result[kind]=measure(page,session,kind)
                print(json.dumps({"run":n+1,"window_dip":[1140,725],"entries":140,"results":result}),flush=True)
        finally:
            quit_app(process,page)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--rounds",type=int,default=3)
    run(parser.parse_args().rounds)
