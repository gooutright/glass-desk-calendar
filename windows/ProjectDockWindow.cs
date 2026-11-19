using System;
using System.Drawing;
using System.Collections.Generic;
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
        readonly Action<string> openNote;
        readonly Action<Exception> report;
        DesktopPlacement placement;
        int width=43;
        readonly List<Rectangle> bands=new List<Rectangle>();
        [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
        [DllImport("gdi32.dll")] static extern int CombineRgn(IntPtr dest,IntPtr first,IntPtr second,int mode);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
        [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
        bool shuttingDown;

        public ProjectDockWindow(CoreWebView2Environment env,Func<Rectangle> bounds,Action<string> open,Action<Exception> log)
        {
            calendarBounds=bounds;openNote=open;report=log;
            Title="项目便签 · Project Notes";WindowStyle=WindowStyle.None;AllowsTransparency=true;
            Background=System.Windows.Media.Brushes.Transparent;ShowInTaskbar=false;ShowActivated=false;
            ResizeMode=ResizeMode.NoResize;Width=width;Height=42;
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
            Closed+=delegate {SystemEvents.DisplaySettingsChanged-=OnDisplayChanged;if(placement!=null)placement.Stop();view.Dispose();};
        }
        void OnDisplayChanged(object sender,EventArgs args)
        {
            if(!shuttingDown)Dispatcher.BeginInvoke(new Action(Align));
        }
        public void Align()
        {
            if(placement==null || shuttingDown)return;
            Rectangle work=Screen.FromRectangle(calendarBounds()).WorkingArea;
            int w=Math.Min(work.Width,(int)Math.Ceiling(width*placement.Scale));
            placement.Place(new Rectangle(work.Right-w,work.Top,w,work.Height));
            ClipToContents();
        }
        void ClipToContents()
        {
            double scale=placement.Scale;
            IntPtr region=CreateRectRgn(0,0,0,0);
            foreach(Rectangle box in bands) {
                IntPtr part=Band(box,scale);
                CombineRgn(region,region,part,2); // RGN_OR: only individual folders and the open list receive input.
                DeleteObject(part);
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
            if(command.StartsWith("open-note|",StringComparison.Ordinal)){
                string id=command.Substring(10);
                if(id.Length>0 && id.Length<200)openNote(id);
                return;
            }
            var parts=command.Split('|');
            int nextWidth;
            if(parts.Length<2 || parts[0]!="dock-regions" || !int.TryParse(parts[1],out nextWidth) ||
                nextWidth<28 || nextWidth>400)return;
            var next=new List<Rectangle>();
            for(int i=2;i<parts.Length;i++){
                string[] edge=parts[i].Split(',');
                int l,t,r,b;
                if(edge.Length!=4 || !int.TryParse(edge[0],out l) || !int.TryParse(edge[1],out t) ||
                    !int.TryParse(edge[2],out r) || !int.TryParse(edge[3],out b) ||
                    l<0 || t<0 || r>nextWidth || b>65535 || r<=l || b<=t)return;
                next.Add(Rectangle.FromLTRB(l,t,r,b));
            }
            width=nextWidth; bands.Clear(); bands.AddRange(next); Align();
        }
        public void End(){shuttingDown=true;Close();}
    }
}
