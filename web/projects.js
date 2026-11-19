(() => {
  "use strict";
  const key = "desktop-calendar.projects.v1";
  const selectedKey = "desktop-calendar.active-project.v1";
  const recordsKey = "desktop-calendar-sketch.records.v1";
  const languageKey = "desktop-calendar-sketch.language.v1";
  const sizeKey = "desktop-calendar-sketch.size.v1";
  const dockHiddenKey = "desktop-calendar.dock-hidden.v1";
  const palette = ["#4a799a","#368575","#bd8050","#b56677","#8174a6"];
  const nativeDock = document.documentElement.classList.contains("dock-page");
  const useNative = location.hostname === "calendar.example" && !!window.chrome?.webview;
  const host = useNative ? window.chrome.webview : null;
  const get = id => document.getElementById(id);
  const ui = (zh,en) => lang() === "en-US" ? en : zh;
  function stored(name) { try { return localStorage.getItem(name); } catch { return null; } }
  function readList(name) {
    try { const value=JSON.parse(stored(name) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function catalog() {
    return readList(key).filter(p => p && typeof p.id==="string" && typeof p.name==="string" && /^#[\da-f]{6}$/i.test(p.color));
  }
  function lang() { return nativeDock ? (stored(languageKey) || "zh-CN") : document.documentElement.lang; }
  function find(id) {
    return catalog().find(p=>p.id===id) || {id:"",name:ui("未分类","Unassigned"),color:"#f0b22b"};
  }
  function active() { return find(stored(selectedKey)).id; }
  function dockHidden() { return stored(dockHiddenKey)==="1"; }
  function paint(node, project) {
    const rgb=[1,3,5].map(i=>parseInt(project.color.slice(i,i+2),16)/255).map(v=>v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    node.style.setProperty("--project-color",project.color);
    node.style.setProperty("--project-mark",.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179 ? "#14212a" : "#fff");
  }
  function tagRow(row,id) {
    const project=find(id);
    row.dataset.projectId=project.id; paint(row,project);
    const check=row.querySelector(".check");
    if (check) check.title=project.name;
  }
  function make(tag,cls,text) {
    const node=document.createElement(tag);
    if (cls) node.className=cls;
    if (text!==undefined) node.textContent=text;
    return node;
  }
  function button(cls,text) { const node=make("button",cls,text); node.type="button"; return node; }
  let editorId="", openGroup=null, listRecords=()=>readList(recordsKey), openNote=null, frame=0;
  let folders=null, deferred=false, closedTabs="";
  function selectOptions(select,id) {
    select.replaceChildren(...[find(""),...catalog()].map(p=>new Option(p.name,p.id)));
    select.value=find(id).id;
    select.setAttribute("aria-label",ui("便签项目","Note project"));
    paint(select.parentElement,find(select.value));
  }
  function showError(message) { get("project-error").textContent=message; get("project-error").hidden=!message; }
  function setEditor(id) {
    editorId=id;
    const project=find(id), used=new Set(catalog().map(p=>p.color));
    get("project-name").value=id ? project.name : "";
    get("project-color").value=id ? project.color : (palette.find(c=>!used.has(c)) || "#517c83");
    get("project-save").textContent=id ? ui("保存修改","Save changes") : ui("创建项目","Create project");
    swatches(); showError("");
  }
  function swatches() {
    const current=get("project-color").value.toLowerCase();
    get("project-palette").replaceChildren(...palette.map(color=>{
      const b=button(); b.style.setProperty("--project-color",color); b.title=color; b.setAttribute("aria-label",color);
      b.setAttribute("aria-pressed",String(current===color));
      b.onclick=()=>{get("project-color").value=color;swatches();}; return b;
    }));
  }
  function updateDockToggle() {
    get("project-dock-toggle").textContent=dockHidden()
      ? ui("显示侧边便签","Show side notes") : ui("隐藏侧边便签","Hide side notes");
  }
  function toolbar() {
    if (!get("project-toggle")) return;
    const choice=find(active()), toggle=get("project-toggle");
    paint(toggle,choice);toggle.querySelector("span").textContent=choice.id ? choice.name : ui("便签项目","Projects");
    toggle.title=ui("选择便签项目和颜色","Choose a note project and color");toggle.setAttribute("aria-label",toggle.title);
    get("project-heading").textContent=ui("便签项目","Note projects");
    get("project-new").textContent=ui("＋ 新项目","+ New");
    get("project-name-label").textContent=ui("名称","Name");
    get("project-color-label").textContent=ui("颜色","Color");
    get("project-color").setAttribute("aria-label",ui("自定义颜色","Custom color"));
    updateDockToggle();
    get("project-options").replaceChildren(...[find(""),...catalog()].map(p=>{
      const b=button("project-option");paint(b,p);b.dataset.project=p.id;b.setAttribute("aria-pressed",String(p.id===choice.id));
      b.append(make("i","project-dot"),make("span","",p.name));
      b.onclick=()=>{
        try { localStorage.setItem(selectedKey,p.id); } catch {showError(ui("项目选择未能保存","Could not save the selection"));return;}
        toolbar();setEditor(p.id); updateDots(); showPicker(false); toggle.focus();
      };
      return b;
    }));
  }
  function updateDots() {
    document.querySelectorAll(".entry").forEach(row=>tagRow(row,row.querySelector(".task")?.value ? row.dataset.projectId : active()));
  }
  function showPicker(show) {
    const picker=get("project-picker"),toggle=get("project-toggle");
    picker.hidden=!show;toggle.setAttribute("aria-expanded",String(show));
    if (show) {
      toolbar();setEditor(active());
      const rect=toggle.getBoundingClientRect();
      picker.style.left=Math.max(6,Math.min(innerWidth-picker.offsetWidth-6,rect.left))+"px";
      picker.style.top=Math.max(5,Math.min(innerHeight-picker.offsetHeight-5,rect.bottom+5))+"px";
    }
  }
  function bindToolbar() {
    const toggle=get("project-toggle"), picker=get("project-picker");
    toggle.onclick=()=>showPicker(picker.hidden);
    get("project-new").onclick=()=>{setEditor("");get("project-name").focus();};
    get("project-dock-toggle").onclick=()=>{
      try {localStorage.setItem(dockHiddenKey,dockHidden() ? "0" : "1");}
      catch {return showError(ui("侧边便签设置未能保存","Could not save side note visibility"));}
      updateDockToggle();dock();
    };
    get("project-color").oninput=swatches;
    get("project-form").onsubmit=event=>{
      event.preventDefault();
      const name=get("project-name").value.trim(),color=get("project-color").value.toLowerCase(), projects=catalog();
      if(!name) return showError(ui("请填写项目名称","Enter a project name"));
      if(projects.some(p=>p.id!==editorId && p.color===color)) return showError(ui("此颜色已有项目，请选其他颜色","This color is already assigned to a project"));
      if(projects.some(p=>p.id!==editorId && p.name.toLowerCase()===name.toLowerCase())) return showError(ui("此名称已有项目","A project already uses this name"));
      const project={id:editorId || crypto.randomUUID(),name,color};
      const index=projects.findIndex(p=>p.id===project.id);
      if(index===-1) projects.push(project); else projects[index]=project;
      try {localStorage.setItem(key,JSON.stringify(projects));localStorage.setItem(selectedKey,project.id);}
      catch {return showError(ui("项目未能保存，请检查本机存储","Could not save this project"));}
      toolbar();updateDots();schedule();showPicker(false);toggle.focus();
    };
    get("note-project").onchange=e=>paint(e.target.parentElement,find(e.target.value));
    document.addEventListener("pointerdown",e=>{if(!picker.hidden && !e.target.closest(".project-control"))showPicker(false);});
    window.addEventListener("resize",()=>{if(!picker.hidden)showPicker(false);});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!picker.hidden){showPicker(false);toggle.focus();}});
    toolbar();
  }

  function dock() {
    const aside=get("project-dock");
    if (!aside || (useNative && !nativeDock)) return;
    if (folders?.dragging()) {deferred=true;return;}
    const records=listRecords().filter(r=>r && typeof r.id==="string" && typeof r.date==="string");
    const projects=catalog(), ids=new Set(projects.map(p=>p.id)), hidden=dockHidden();
    const all=hidden ? [] : projects.slice();
    if(!hidden && (!all.length || records.some(r=>!ids.has(r.projectId)))) all.unshift(find(""));
    if(openGroup!==null&&!all.some(p=>p.id===openGroup)) openGroup=null;
    let tabs=get("project-tabs"),panel=get("project-panel");
    if(!tabs) {
      tabs=make("div");tabs.id="project-tabs";
      panel=make("section","dock-panel"); panel.id="project-panel";
      aside.append(panel,tabs);
      folders=CalendarFolders.mount(aside,tabs,panel,nativeDock ? host : null,()=>{
        if(deferred){deferred=false;schedule();}
      });
    }
    const signature=JSON.stringify([lang(),all]);
    if (openGroup===null && closedTabs===signature) return;
    closedTabs=openGroup===null ? signature : "";
    aside.setAttribute("aria-label",ui("项目文件夹","Project folders"));
    const focused=document.activeElement?.dataset, tabFocus=focused?.projectTab, rowFocus=focused?.openNote;
    const tabScroll=tabs.scrollTop;
    tabs.replaceChildren(...all.map(p=>{
      const tab=button("dock-tab");
      tab.dataset.projectTab=p.id;
      tab.setAttribute("aria-label",p.name);
      tab.setAttribute("aria-expanded",String(openGroup===p.id));
      tab.setAttribute("aria-controls","project-panel");
      paint(tab,p);
      const lip=make("span","folder-lip");
      lip.setAttribute("aria-hidden","true");
      tab.append(lip,make("span","folder-name",p.name));
      tab.onclick=()=>{openGroup=openGroup===p.id ? null : p.id;dock();};
      return tab;
    }));
    panel.hidden=openGroup===null;
    aside.dataset.expanded=String(!panel.hidden);
    if(!panel.hidden) {
      const p=find(openGroup);
      const entries=records.filter(r=>(ids.has(r.projectId)?r.projectId:"")===p.id).sort((a,b)=>a.date.localeCompare(b.date));
      const count=entries.length;paint(panel,p);
      const top=make("header");top.append(make("i","project-dot"),make("strong","",p.name+" · "+count));
      const close=button("dock-close","×");close.setAttribute("aria-label",ui("收起便签","Collapse notes"));
      close.onclick=()=>{const previous=openGroup;openGroup=null;dock();[...tabs.children].find(t=>t.dataset.projectTab===previous)?.focus();};top.append(close);
      const list=make("div","project-items");
      const scroll=panel.dataset.project===p.id ? (panel.querySelector(".project-items")?.scrollTop || 0) : 0;
      panel.dataset.project=p.id;
      for(const item of entries) {
        const b=button("dock-item");b.dataset.openNote=item.id;b.dataset.done=String(!!item.done);
        const d=make("time","",item.date);d.dateTime=item.date;
        b.append(d,make("span","",item.text));
        b.onclick=()=>{openGroup=null;dock();if(nativeDock)host.postMessage("open-note|"+item.id);else openNote?.(item.id);};list.append(b);
      }
      if(!count) list.append(make("p","dock-empty",ui("这个项目还没有便签","No notes in this project yet")));
      panel.replaceChildren(top,list);list.scrollTop=scroll;
    }
    if(rowFocus) [...panel.querySelectorAll(".dock-item")].find(b=>b.dataset.openNote===rowFocus)?.focus({preventScroll:true});
    else if(tabFocus!==undefined) [...tabs.children].find(b=>b.dataset.projectTab===tabFocus)?.focus({preventScroll:true});
    folders.layout(tabScroll);
  }
  function schedule() { if(!frame) frame=requestAnimationFrame(()=>{frame=0;dock();}); }
  function syncDockFont() {
    let size;
    try { const saved=JSON.parse(stored(sizeKey)||"{}"); size=saved.noteFont ?? saved.font; } catch {}
    document.documentElement.style.setProperty("--task-size",
      Number.isFinite(size) && size>=11 && size<=32 ? size+"px" : "");
  }
  window.addEventListener("storage",event=>{
    if(nativeDock && (event.key===sizeKey || event.key===null)) {syncDockFont();folders?.layout();}
    if(![key,recordsKey,selectedKey,languageKey,dockHiddenKey,null].includes(event.key)) return;
    if(nativeDock) document.documentElement.lang=lang();
    else if(event.key===dockHiddenKey) updateDockToggle();
    else if(event.key!==recordsKey){toolbar();updateDots();}
    // Restore immediately even when the empty native window is not painting frames.
    if(event.key===dockHiddenKey || event.key===null) dock();else schedule();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&openGroup!==null){
      const previous=openGroup;openGroup=null;dock();
      [...get("project-tabs").children].find(tab=>tab.dataset.projectTab===previous)?.focus();
    }
    const tab=e.target.closest(".dock-tab");
    if(!tab || !["ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
    e.preventDefault();
    const ordered=folders.ordered(),index=ordered.indexOf(tab);
    const next={ArrowUp:ordered[index-1],ArrowDown:ordered[index+1],Home:ordered[0],End:ordered.at(-1)};
    next[e.key]?.focus();
  });
  window.CalendarProjects=Object.freeze({find,active,tagRow,selectOptions,refresh:schedule,langChanged(){toolbar();schedule();},
    mount(records,open){listRecords=records;openNote=open;bindToolbar();dock();}});
  if(nativeDock) {
    syncDockFont();
    document.documentElement.lang=lang();dock();
    host.addEventListener("message",e=>{if(e.data==="collapse"){openGroup=null;dock();}});
  }
})();
