using System;
using System.Drawing;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace GlassDeskCalendar
{
    // An unowned top-level window. Editing a note does not disable the calendar or Explorer.
    internal sealed class NoteWindow : Window
    {
        readonly WebView2CompositionControl view;
        readonly string address;
        readonly Action cancelledExit;
        DesktopPlacement placement;
        bool closing, closeRequested, ready;

        public NoteWindow(CoreWebView2Environment environment, string id, Rectangle bounds,
                          Action cancelExit, Action<Exception> report)
        {
            address="https://calendar.example/index.html?note="+Uri.EscapeDataString(id);
            cancelledExit=cancelExit;
            Title="便签 · Calendar Note";
            WindowStyle=WindowStyle.None; ResizeMode=ResizeMode.NoResize; AllowsTransparency=true;
            Background=System.Windows.Media.Brushes.Transparent; ShowInTaskbar=true;
            WindowStartupLocation=WindowStartupLocation.Manual;
            Width=360; Height=300;
            view=new WebView2CompositionControl { DefaultBackgroundColor=Color.Transparent, AllowExternalDrop=true };
            Content=view;
            SourceInitialized+=delegate {
                placement=new DesktopPlacement(new WindowInteropHelper(this).Handle,delegate{},275,240,22);
                placement.Place(bounds);
            };
            Loaded+=async delegate {
                try {
                    await view.EnsureCoreWebView2Async(environment);
                    if (closing) return;
                    var core=view.CoreWebView2;
                    core.SetVirtualHostNameToFolderMapping("calendar.example",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.Deny);
                    core.Settings.AreHostObjectsAllowed=false; core.Settings.AreDefaultContextMenusEnabled=false;
                    core.Settings.AreDevToolsEnabled=false; core.Settings.IsStatusBarEnabled=false; core.Settings.IsZoomControlEnabled=false;
                    core.NavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){if(e.Uri!=address)e.Cancel=true;};
                    core.NewWindowRequested+=delegate(object s,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
                    core.WebMessageReceived+=Receive;
                    core.Navigate(address);
                } catch(Exception ex) { if (!closing) { report(ex); closing=true; Close(); } }
            };
            Closing+=delegate(object s,System.ComponentModel.CancelEventArgs e) {
                if (!closing && view.CoreWebView2!=null) { e.Cancel=true; RequestClose(); }
            };
            Closed+=delegate { closing=true; if(placement!=null)placement.Stop(); view.Dispose(); };
        }
        public void Raise()
        {
            if (WindowState==WindowState.Minimized) WindowState=WindowState.Normal;
            Activate(); DesktopPlacement.SetForegroundWindow(new WindowInteropHelper(this).Handle); view.Focus();
        }
        public void RequestClose()
        {
            if (closing || closeRequested) return;
            if (!ready) { closing=true; Close(); return; }
            Raise(); closeRequested=true;
            view.CoreWebView2.PostWebMessageAsString("request-close");
        }
        void Receive(object sender,CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (e.Source!=address || closing) return;
            string command;
            try { command=e.TryGetWebMessageAsString(); } catch(ArgumentException){return;}
            if (command=="note-close") { closing=true; Dispatcher.BeginInvoke(new Action(Close)); }
            else if (command=="note-ready") ready=true;
            else if (command=="note-keep") { closeRequested=false; cancelledExit(); }
            else if (command=="drag=move") Dispatcher.BeginInvoke(new Action(delegate { if(!closing)placement.BeginDrag("move"); }));
        }
    }
}
