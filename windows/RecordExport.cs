using System;
using System.Globalization;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace GlassDeskCalendar
{
    internal sealed class RecordExport
    {
        const int ChunkSize = 192 * 1024;
        readonly Window owner;
        readonly CoreWebView2 page;
        readonly string initialFolder;
        readonly Func<bool> available;
        readonly Action<Exception> log;
        bool busy;

        public RecordExport(Window window,CoreWebView2 web,string initialDirectory,Func<bool> isAvailable,Action<Exception> logError)
        {
            owner=window; page=web; initialFolder=initialDirectory; available=isAvailable; log=logError;
        }
        public async void Save(string request,bool english)
        {
            string[] args=request.Split('|');
            Guid token; long total;
            if (busy || !available() || args.Length!=4 || !Guid.TryParseExact(args[1],"D",out token) ||
                (args[2]!="csv" && args[2]!="html") || !long.TryParse(args[3],NumberStyles.None,CultureInfo.InvariantCulture,out total)) return;
            busy=true;
            string status="cancel", partial=null;
            bool created=false;
            try {
                string ext=args[2], date=DateTime.Now.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
                var picker=new SaveFileDialog {
                    FileName=Path.Combine(initialFolder,(english ? "Calendar_" : "月历清单_")+date+"."+ext),
                    DefaultExt="."+ext, AddExtension=true, OverwritePrompt=true,
                    Filter=ext=="csv" ? "CSV (*.csv)|*.csv" : "HTML (*.html)|*.html",
                    InitialDirectory=initialFolder
                };
                if (picker.ShowDialog(owner)!=true) return;
                partial=Path.Combine(Path.GetDirectoryName(picker.FileName),".glass-calendar-"+token.ToString("N")+".tmp");
                using (var file=new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,true)) {
                    created=true;
                    for (long offset=0; offset<total;) {
                        if (!available()) throw new OperationCanceledException();
                        int count=(int)Math.Min(ChunkSize,total-offset);
                        string script=String.Format(CultureInfo.InvariantCulture,"window.readCalendarExportChunk('{0}',{1},{2})",token,offset,count);
                        // ExecuteScript is synchronous in the page. The CDP evaluation awaits the FileReader promise.
                        var result=await page.CallDevToolsProtocolMethodAsync("Runtime.evaluate",
                            "{\"expression\":\""+script+"\",\"awaitPromise\":true,\"returnByValue\":true}");
                        var decoded=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Evaluation>(result);
                        if (decoded==null || decoded.result==null || decoded.result.type!="string") throw new IOException("Export data unavailable.");
                        byte[] bytes=Convert.FromBase64String(decoded.result.value);
                        if (bytes.Length!=count) throw new IOException("Incomplete export data.");
                        await file.WriteAsync(bytes,0,count);
                        offset+=count;
                    }
                    file.Flush(true);
                }
                if (File.Exists(picker.FileName)) File.Replace(partial,picker.FileName,null); else File.Move(partial,picker.FileName);
                partial=null; status="saved";
            } catch (Exception ex) { status="error"; log(ex); }
            finally {
                if (created && partial!=null) try { File.Delete(partial); } catch (IOException) { }
                busy=false;
                if (available()) page.PostWebMessageAsString("export|"+token+"|"+status);
            }
        }
        sealed class Evaluation { public RemoteValue result { get; set; } }
        sealed class RemoteValue { public string type { get; set; } public string value { get; set; } }
    }
}
