using System;
using System.Drawing;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
using Screen = System.Windows.Forms.Screen;

namespace GlassDeskCalendar
{
    internal sealed class ProjectDockWindow : Window
    {
        const string Address="https://calendar.example/dock.html";
        readonly WebView2CompositionControl view;
        readonly Func<Rectangle> calendarBounds;
        readonly Func<bool> isPinned;
        readonly Action<string> openNote;
        readonly Action<Exception> report;
        DesktopPlacement placement;
        int width=34,height=42;
        bool shuttingDown;

        public ProjectDockWindow(CoreWebView2Environment env,Func<Rectangle> bounds,Func<bool> pinned,Action<string> open,Action<Exception> log)
        {
            calendarBounds=bounds;isPinned=pinned;openNote=open;report=log;
            Title="项目便签 · Project Notes";WindowStyle=WindowStyle.None;AllowsTransparency=true;
            Background=System.Windows.Media.Brushes.Transparent;ShowInTaskbar=false;ShowActivated=false;
            ResizeMode=ResizeMode.NoResize;Width=width;Height=height;
            view=new WebView2CompositionControl {DefaultBackgroundColor=Color.Transparent};
            Content=view;
            SourceInitialized+=delegate {
                placement=new DesktopPlacement(new WindowInteropHelper(this).Handle,delegate{},1,1);
                Align();
            };
            Loaded+=async delegate {
                try {
                    await view.EnsureCoreWebView2Async(env);
                    if(shuttingDown)return;
                    var core=view.CoreWebView2;
                    core.SetVirtualHostNameToFolderMapping("calendar.example",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.Deny);
                    core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;
                    core.Settings.AreHostObjectsAllowed=false;core.Settings.IsZoomControlEnabled=false;
                    core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs a){if(a.Uri!=Address)a.Cancel=true;};
                    core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs a){a.Handled=true;};
                    core.WebMessageReceived+=Receive;
                    core.Navigate(Address);
                } catch(Exception ex){if(!shuttingDown)report(ex);}
            };
            SystemEvents.DisplaySettingsChanged+=OnDisplayChanged;
            Closing+=delegate(object sender,System.ComponentModel.CancelEventArgs e) {
                if(!shuttingDown){e.Cancel=true;if(view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsString("collapse");}
            };
            Closed+=delegate {SystemEvents.DisplaySettingsChanged-=OnDisplayChanged;view.Dispose();};
        }
        void OnDisplayChanged(object sender,EventArgs args)
        {
            if(!shuttingDown)Dispatcher.BeginInvoke(new Action(Align));
        }
        public void Align()
        {
            if(placement==null || shuttingDown)return;
            placement.Pin(isPinned());
            Rectangle work=Screen.FromRectangle(calendarBounds()).WorkingArea;
            int w=Math.Min(work.Width,(int)Math.Ceiling(width*placement.Scale));
            int h=Math.Min(work.Height,(int)Math.Ceiling(height*placement.Scale));
            placement.Place(new Rectangle(work.Right-w,work.Top+(work.Height-h)/2,w,h));
        }
        void Receive(object sender,CoreWebView2WebMessageReceivedEventArgs e)
        {
            if(e.Source!=Address || shuttingDown)return;
            string command;
            try{command=e.TryGetWebMessageAsString();}catch(ArgumentException){return;}
            if(command.StartsWith("open-note|",StringComparison.Ordinal)){
                string id=command.Substring(10);
                if(id.Length>0 && id.Length<200)openNote(id);
                return;
            }
            var parts=command.Split('|');int w,h;
            if(parts.Length!=3 || parts[0]!="dock-size" || !int.TryParse(parts[1],out w) || !int.TryParse(parts[2],out h))return;
            width=Math.Min(400,Math.Max(30,w));height=Math.Min(620,Math.Max(32,h));Align();
        }
        public void End(){shuttingDown=true;Close();}
    }
}
