using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
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
        double anchor=.5;
        Rectangle tabs, panel;
        [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
        [DllImport("gdi32.dll")] static extern int CombineRgn(IntPtr dest,IntPtr first,IntPtr second,int mode);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
        [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
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
                placement=new DesktopPlacement(new WindowInteropHelper(this).Handle,StoreAnchor,1,1);
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
            Closed+=delegate {SystemEvents.DisplaySettingsChanged-=OnDisplayChanged;if(placement!=null)placement.Stop();view.Dispose();};
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
            placement.Place(new Rectangle(work.Right-w,work.Top+(int)Math.Round(anchor*(work.Height-h)),w,h));
            ClipToContents();
        }
        void StoreAnchor()
        {
            Rectangle work=Screen.FromRectangle(calendarBounds()).WorkingArea, bounds=placement.Bounds;
            if (work.Height>bounds.Height) anchor=Math.Max(0,Math.Min(1,(bounds.Top-work.Top)/(double)(work.Height-bounds.Height)));
            if (view.CoreWebView2!=null) view.CoreWebView2.PostWebMessageAsString("dock-anchor|"+anchor.ToString("R",CultureInfo.InvariantCulture));
        }
        void ClipToContents()
        {
            if (tabs.IsEmpty) return;
            double scale=placement.Scale;
            IntPtr region=Band(tabs,scale);
            if (!panel.IsEmpty) {
                IntPtr list=Band(panel,scale);
                CombineRgn(region,region,list,2); // RGN_OR: blank space beside a short panel stays clickable.
                DeleteObject(list);
            }
            if (SetWindowRgn(new WindowInteropHelper(this).Handle,region,true)==0) DeleteObject(region);
        }
        static IntPtr Band(Rectangle r,double scale)
        {
            return CreateRectRgn((int)Math.Floor(r.Left*scale),(int)Math.Floor(r.Top*scale),
                (int)Math.Ceiling(r.Right*scale),(int)Math.Ceiling(r.Bottom*scale));
        }
        void Receive(object sender,CoreWebView2WebMessageReceivedEventArgs e)
        {
            if(e.Source!=Address || shuttingDown)return;
            string command;
            try{command=e.TryGetWebMessageAsString();}catch(ArgumentException){return;}
            if(command=="dock-drag"){placement.BeginDrag("rail");return;}
            if(command.StartsWith("dock-anchor|",StringComparison.Ordinal)){
                double value;
                if(double.TryParse(command.Substring(12),NumberStyles.Float,CultureInfo.InvariantCulture,out value) && value>=0 && value<=1){anchor=value;Align();}
                return;
            }
            if(command.StartsWith("open-note|",StringComparison.Ordinal)){
                string id=command.Substring(10);
                if(id.Length>0 && id.Length<200)openNote(id);
                return;
            }
            var parts=command.Split('|');
            if(parts.Length!=11 || parts[0]!="dock-size")return;
            int[] n=new int[10];
            for(int i=0;i<n.Length;i++)if(!int.TryParse(parts[i+1],out n[i]) || n[i]<0 || n[i]>2048)return;
            width=Math.Min(400,Math.Max(30,n[0]));height=Math.Min(620,Math.Max(32,n[1]));
            tabs=Rectangle.FromLTRB(n[2],n[3],n[4],n[5]);panel=Rectangle.FromLTRB(n[6],n[7],n[8],n[9]);Align();
        }
        public void End(){shuttingDown=true;Close();}
    }
}
