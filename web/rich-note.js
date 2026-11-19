(() => {
  "use strict";
  const sizes = [10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 64].map(n => n + "px");
  const hex = /^#[\da-f]{6}$/i;
  function attributes(value) {
    const attrs = {};
    if (!value || typeof value !== "object") return attrs;
    if (sizes.includes(value.size)) attrs.size = value.size;
    for (const key of ["bold", "underline"]) if (value[key] === true) attrs[key] = true;
    for (const key of ["color", "background"]) if (hex.test(value[key])) attrs[key] = value[key].toLowerCase();
    return attrs;
  }

  // Style and photo positions use offsets into the original UTF-16 note text.
  function* parts(record, textAndPhotos) {
    const spans = Array.isArray(record.noteStyles) ? record.noteStyles.filter(s =>
      s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end > s.start) : [];
    let offset = 0, index = 0;
    for (const part of textAndPhotos) {
      if (typeof part !== "string") { yield {photo:part}; continue; }
      const end = offset + part.length, start = offset;
      while (offset < end) {
        while (index < spans.length && spans[index].end <= offset) index++;
        const span = spans[index];
        const styled = span && span.start <= offset;
        const limit = Math.min(end, styled ? span.end : span?.start ?? end);
        yield {text:part.slice(offset - start, limit - start), attributes:styled ? attributes(span.attributes) : {}};
        offset = limit;
      }
    }
  }

  function css(format) {
    return [format.size && "font-size:" + format.size, format.bold && "font-weight:700",
      format.underline && "text-decoration:underline", format.color && "color:" + format.color,
      format.background && "background-color:" + format.background].filter(Boolean).join(";");
  }

  function create(container, paintPhoto) {
    const get = id => document.getElementById(id);
    const Size = Quill.import("attributors/style/size");
    Size.whitelist = sizes;
    Quill.register(Size, true);
    const Embed = Quill.import("blots/embed");
    class CalendarPhoto extends Embed {
      static create(id) {
        const node = super.create();
        node.dataset.imageId = id;
        paintPhoto(node, id);
        return node;
      }
      static value(node) { return node.dataset.imageId; }
    }
    CalendarPhoto.blotName = "calendarPhoto";
    CalendarPhoto.tagName = "span";
    CalendarPhoto.className = "note-photo";
    Quill.register(CalendarPhoto, true);
    const editor = new Quill(container, {theme:null, formats:["size","bold","underline","color","background","calendarPhoto"],
      modules:{toolbar:false, uploader:false, history:{userOnly:true}}});
    editor.root.id = "note-body";
    editor.root.setAttribute("role","textbox");
    editor.root.setAttribute("aria-multiline","true");
    editor.root.dataset.aria = "noteBody";

    const toolbar = get("note-format"), size = get("format-size");
    for (const value of sizes) size.add(new Option(value.slice(0,-2),value));
    let lastRange = {index:0,length:0};
    function selection() {
      const selected = editor.getSelection() || lastRange;
      const end = editor.getLength()-1, index = Math.min(selected.index,end);
      return {index,length:Math.min(selected.length,end-index)};
    }
    function sync() {
      const range = selection(), format = editor.getFormat(range);
      size.value = typeof format.size === "string" ? format.size : "";
      for (const name of ["bold","underline"]) get("format-"+name).setAttribute("aria-pressed",String(format[name] === true));
      for (const [name,id] of [["color","color"],["background","highlight"]]) {
        const input = get("format-"+id);
        if (typeof format[name] === "string" && hex.test(format[name])) input.value = format[name];
        const apply = get("apply-"+id);
        apply.style.setProperty("--swatch",input.value);
        apply.setAttribute("aria-pressed",String(typeof format[name] === "string"));
      }
    }
    function apply(name,value) {
      const range = selection(), current = editor.getSelection();
      if (!current || current.index!==range.index || current.length!==range.length) editor.setSelection(range,"silent");
      editor.format(name,value,"user");
      lastRange = range;
      sync();
    }
    editor.on("selection-change", range => { if (range) { lastRange=range; sync(); } });
    toolbar.addEventListener("pointerdown", e => {
      lastRange=selection();
      if (e.target.closest("button")) e.preventDefault();
    });
    for (const name of ["bold","underline"]) get("format-"+name).onclick = () => apply(name,editor.getFormat(selection())[name] !== true);
    size.onchange = () => apply("size",size.value || false);
    for (const [name,id] of [["color","color"],["background","highlight"]]) {
      const input=get("format-"+id);
      input.onchange=() => apply(name,input.value);
      get("apply-"+id).onclick=() => apply(name,editor.getFormat(selection())[name]===input.value ? false : input.value);
    }
    return {
      root:editor.root,
      reset(record, textAndPhotos) {
        const ops = Array.from(parts(record,textAndPhotos), p => p.photo ? {insert:{calendarPhoto:p.photo.id}} : {insert:p.text,attributes:p.attributes});
        ops.push({insert:"\n"});
        editor.setContents(ops,"silent");
        editor.history.clear();
        lastRange={index:0,length:0};
        sync();
      },
      focus() { editor.setSelection(0,0,"silent"); editor.focus({preventScroll:true}); sync(); },
      read(photos) {
        let text="";
        const images=[], styles=[];
        for (const op of editor.getContents(0,editor.getLength()-1).ops) {
          if (typeof op.insert === "string") {
            const start=text.length, format=attributes(op.attributes);
            text+=op.insert;
            if (!Object.keys(format).length) continue;
            const last=styles.at(-1);
            if (last && last.end===start && JSON.stringify(last.attributes)===JSON.stringify(format)) last.end=text.length;
            else styles.push({start,end:text.length,attributes:format});
          } else {
            const photo=photos.get(op.insert.calendarPhoto);
            if (photo) images.push({id:photo.id,name:photo.name,at:text.length});
          }
        }
        return {text,images,styles};
      },
      addPhotos(ids) {
        const range=selection();
        const Delta=Quill.import("delta");
        let delta=new Delta().retain(range.index).delete(range.length);
        for(const id of ids) delta=delta.insert({calendarPhoto:id});
        editor.history.cutoff();
        editor.updateContents(delta,"user");
        editor.setSelection(range.index+ids.length,0,"user");
        editor.history.cutoff();
      },
      removePhoto(node) {
        const index=editor.getIndex(Quill.find(node));
        editor.deleteText(index,1,"user");
        editor.setSelection(index,0,"user");
      }
    };
  }
  window.CalendarRichNote=Object.freeze({create,parts,css});
})();
