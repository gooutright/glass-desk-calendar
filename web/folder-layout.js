(() => {
  "use strict";
  const positionKey="desktop-calendar.folder-positions.v1";
  const legacyKey="desktop-calendar.dock-position.v1";
  const gap=4;
  const clamp=(value,low,high)=>Math.max(low,Math.min(value,high));
  function nearestSlot(wanted,height,occupied,limit) {
    let start=0,best=null,distance=Infinity;
    function consider(end) {
      if(end-start<height)return;
      const candidate=clamp(wanted,start,end-height),diff=Math.abs(wanted-candidate);
      if(diff<distance){best=candidate;distance=diff;}
    }
    for(const box of occupied.slice().sort((a,b)=>a.top-b.top)) {
      consider(box.top-gap);
      start=Math.max(start,box.top+box.height+gap);
    }
    consider(limit);
    return Math.round(best??start);
  }

  function mount(rail,tabs,panel,host,onRelease) {
    let saved=Object.create(null),anchor=.5,total=0,drag=null,suppressClick=false,frame=0,lastGeometry="";
    try {
      const value=JSON.parse(localStorage.getItem(positionKey)||"{}");
      if(value && typeof value==="object")Object.assign(saved,value);
      const old=Number(localStorage.getItem(legacyKey)??.5);
      if(Number.isFinite(old))anchor=clamp(old,0,1);
    } catch {}
    const rows=()=>Array.from(tabs.children);
    function geometry() {
      const active=tabs.querySelector('[aria-expanded=true]');
      if(active && !panel.hidden) {
        const center=active.offsetTop-tabs.scrollTop+active.offsetHeight/2;
        panel.style.top=Math.round(clamp(center-panel.offsetHeight/2,0,rail.clientHeight-panel.offsetHeight))+"px";
      }
      if(!host)return;
      const origin=rail.getBoundingClientRect(), bands=[];
      function add(node) {
        const r=node.getBoundingClientRect(),y=Math.max(0,Math.floor(r.top-origin.top));
        const bottom=Math.min(rail.clientHeight,Math.ceil(r.bottom-origin.top));
        if(bottom>y)bands.push([Math.round(r.left-origin.left),y,Math.round(r.right-origin.left),bottom].join(","));
      }
      // Capture the thin right-hand strip only for the duration of a pointer gesture.
      // At rest, space between folders has no native window hit region.
      if(drag)add(tabs);else rows().forEach(add);
      if(!panel.hidden)add(panel);
      const message=["dock-regions",Math.ceil(origin.width),...bands].join("|");
      if(message!==lastGeometry) { lastGeometry=message; host.postMessage(message); }
    }
    function queueGeometry() {
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;geometry();});
    }
    function layout(scroll=tabs.scrollTop) {
      if(drag)return;
      const height=tabs.clientHeight,items=rows().map(tab=>({tab,height:tab.offsetHeight,id:tab.dataset.projectTab}));
      if(!height || !items.length)return;
      const sum=items.reduce((n,item)=>n+item.height+gap,-gap);
      total=Math.max(height,sum);
      let cursor=Math.round(Math.max(0,height-sum)*anchor);
      for(const item of items) {
        const value=saved[item.id];
        item.placed=Number.isFinite(value) && value>=0;
        item.wanted=item.placed ? Math.round(value*height) : cursor;
        cursor+=item.height+gap;
      }
      const occupied=[];
      // Place remembered folders first so adding an unpositioned project cannot move them.
      items.sort((a,b)=>Number(b.placed)-Number(a.placed) || a.wanted-b.wanted);
      for(const item of items) {
        const top=nearestSlot(item.wanted,item.height,occupied,total);
        item.tab.style.top=top+"px";
        occupied.push({top,height:item.height});
        total=Math.max(total,top+item.height);
      }
      tabs.style.setProperty("--track-height",total+"px");
      tabs.scrollTop=scroll;
      geometry();
    }
    function finish(commit) {
      if(!drag)return;
      const {tab,original}=drag;
      if(suppressClick && commit) {
        const others=rows().filter(t=>t!==tab).map(t=>({top:t.offsetTop,height:t.offsetHeight}));
        tab.style.top=nearestSlot(tab.offsetTop,tab.offsetHeight,others,total)+"px";
        const height=tabs.clientHeight;
        for(const t of rows())saved[t.dataset.projectTab]=t.offsetTop/height;
        try {localStorage.setItem(positionKey,JSON.stringify(saved));}catch{}
      } else tab.style.top=original+"px";
      tab.classList.remove("dragging");drag=null;geometry();onRelease();
    }
    function move(e) {
      if(!drag || drag.pointer!==e.pointerId)return;
      const dy=e.screenY-drag.y;
      if(Math.abs(dy)>=5)suppressClick=true;
      if(!suppressClick)return;
      if(total>tabs.clientHeight) {
        if(e.clientY<16)tabs.scrollTop-=10;
        else if(e.clientY>tabs.clientHeight-16)tabs.scrollTop+=10;
      }
      const y=drag.original+dy+tabs.scrollTop-drag.scroll;
      drag.tab.style.top=Math.round(clamp(y,0,total-drag.tab.offsetHeight))+"px";
      queueGeometry();
    }
    tabs.addEventListener("pointerdown",e=>{
      const tab=e.target.closest(".dock-tab");
      if(!tab || !e.isPrimary || e.button!==0)return;
      drag={tab,pointer:e.pointerId,y:e.screenY,original:tab.offsetTop,scroll:tabs.scrollTop};
      suppressClick=false;tab.setPointerCapture(e.pointerId);tab.classList.add("dragging");geometry();
    });
    tabs.addEventListener("pointermove",move);
    tabs.addEventListener("pointerup",e=>{if(drag?.pointer===e.pointerId){move(e);finish(true);}});
    tabs.addEventListener("lostpointercapture",()=>finish(false));
    window.addEventListener("blur",()=>finish(false));
    tabs.addEventListener("click",e=>{
      if(suppressClick && e.detail){e.preventDefault();e.stopPropagation();}
      suppressClick=false;
    },true);
    tabs.addEventListener("scroll",queueGeometry,{passive:true});
    window.addEventListener("resize",()=>layout());
    return {layout,dragging:()=>Boolean(drag),ordered:()=>rows().sort((a,b)=>a.offsetTop-b.offsetTop)};
  }
  window.CalendarFolders=Object.freeze({mount});
})();
