using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms = System.Windows.Forms;

[assembly: AssemblyTitle("Glass Desk Calendar")]
[assembly: AssemblyProduct("Glass Desk Calendar")]
[assembly: AssemblyVersion("1.3.4.0")]
[assembly: AssemblyFileVersion("1.3.4.0")]

namespace GlassDeskCalendar
{
    internal static class Program
    {
        [STAThread] public static int Main(string[] args)
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GlassDeskCalendar");
            if (args.Length == 2 && args[0]=="--data-dir") folder = Path.GetFullPath(args[1]);
            Directory.CreateDirectory(folder);
            string key;
            using (var sha=SHA256.Create()) key = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(folder.ToUpperInvariant()))).Replace("-","");
            bool first;
            using (var mutex = new Mutex(true,"Local\\GlassDeskCalendar-"+key,out first))
            using (var signal = new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\GlassDeskCalendar-Show-"+key)) {
                if (!first) { signal.Set(); return 0; }
                var application = new Application();
                var window = new CalendarWindow(folder, args.Length == 2 && args[0]=="--data-dir");
                var listener = ThreadPool.RegisterWaitForSingleObject(signal,delegate {
                    if (!application.Dispatcher.HasShutdownStarted) application.Dispatcher.BeginInvoke(new Action(window.ShowAsWindow));
                },null,Timeout.Infinite,false);
                try { return application.Run(window); }
                finally { listener.Unregister(null); mutex.ReleaseMutex(); }
            }
        }
    }

    internal sealed class CalendarWindow : Window
    {
        const string Address = "https://calendar.example/index.html";
        readonly string folder;
        readonly bool isolatedProfile;
        readonly WebView2CompositionControl view;
        readonly Forms.NotifyIcon tray;
        readonly Forms.ToolStripMenuItem showMenu, pinMenu, exitMenu;
        DesktopPlacement position;
        readonly System.Windows.Threading.DispatcherTimer geometryDelay = new System.Windows.Threading.DispatcherTimer();
        RecordExport exporter;
        ProjectDockWindow dock;
        readonly Dictionary<string,NoteWindow> notes=new Dictionary<string,NoteWindow>();
        CoreWebView2Environment environment;
        bool english, closing, exitRequested;
        bool wantedPin;
        Rectangle? previousBounds;
        string GeometryFile { get { return Path.Combine(folder,"window.txt"); } }

        public CalendarWindow(string dataFolder, bool isolated)
        {
            folder = dataFolder; isolatedProfile=isolated; ReadState();
            Title = "桌面月历 · Glass Desk Calendar";
            WindowStyle=WindowStyle.None; AllowsTransparency=true; Background=System.Windows.Media.Brushes.Transparent;
            ResizeMode=ResizeMode.NoResize; ShowInTaskbar=false;
            Width=840; Height=580; WindowStartupLocation=WindowStartupLocation.Manual;
            view = new WebView2CompositionControl { DefaultBackgroundColor=System.Drawing.Color.Transparent, AllowExternalDrop=true };
            Content = view;
            geometryDelay.Interval=TimeSpan.FromMilliseconds(280);
            geometryDelay.Tick+=delegate { geometryDelay.Stop(); SaveState(); };
            var menu = new Forms.ContextMenuStrip();
            showMenu = new Forms.ToolStripMenuItem("",null,delegate { ShowAsWindow(); });
            pinMenu = new Forms.ToolStripMenuItem("",null,delegate { SetPinned(!position.Pinned); });
            exitMenu = new Forms.ToolStripMenuItem("",null,delegate { Close(); });
            menu.Items.AddRange(new Forms.ToolStripItem[]{showMenu,pinMenu,new Forms.ToolStripSeparator(),exitMenu});
            tray = new Forms.NotifyIcon { Icon=System.Drawing.Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location), ContextMenuStrip=menu };
            TrayText(); tray.Visible=true;
            tray.DoubleClick += delegate { ShowAsWindow(); };
            SourceInitialized += delegate {
                position = new DesktopPlacement(new WindowInteropHelper(this).Handle,ScheduleGeometrySave,350,320,24);
                position.Place(previousBounds ?? position.DefaultBounds());
            };
            Loaded += OpenPage;
            Closing += delegate(object sender,System.ComponentModel.CancelEventArgs e) {
                if (notes.Count>0) {
                    e.Cancel=true; exitRequested=true;
                    foreach (NoteWindow editor in notes.Values) { editor.RequestClose(); break; }
                    return;
                }
                closing=true;
                geometryDelay.Stop();
                if (position!=null) { position.Stop(); SaveState(); }
                if (dock!=null) { dock.End(); dock=null; }
            };
            Closed += delegate { tray.Visible=false; tray.Dispose(); menu.Dispose(); view.Dispose(); };
        }

        void ReadState()
        {
            try {
                if (!File.Exists(GeometryFile)) return;
                string[] v=File.ReadAllText(GeometryFile).Trim().Split(',');
                if (v.Length!=5) return;
                int x,y,w,h;
                if (int.TryParse(v[0],out x) && int.TryParse(v[1],out y) && int.TryParse(v[2],out w) && int.TryParse(v[3],out h) && w>0 && h>0 &&
                    Math.Abs((long)x)<100000 && Math.Abs((long)y)<100000 && w<100000 && h<100000) previousBounds=new Rectangle(x,y,w,h);
                wantedPin=v[4]=="1";
            } catch (IOException) { }
        }
        void ScheduleGeometrySave()
        {
            geometryDelay.Stop();
            geometryDelay.Start();
        }
        void SaveState()
        {
            if (position==null) return;
            Rectangle r=position.RestoredBounds;
            if(dock!=null&&!closing)dock.Align();
            string data=String.Format(CultureInfo.InvariantCulture,"{0},{1},{2},{3},{4}",r.X,r.Y,r.Width,r.Height,wantedPin ? 1 : 0);
            try {
                string tmp=GeometryFile+".tmp";
                File.WriteAllText(tmp,data);
                if (File.Exists(GeometryFile)) File.Replace(tmp,GeometryFile,null); else File.Move(tmp,GeometryFile);
            } catch (Exception ex) { Log(ex); }
        }
        void Log(Exception ex) { try { File.WriteAllText(Path.Combine(folder,"last-error.txt"),ex.ToString()); } catch (IOException) { } }
        void TrayText()
        {
            tray.Text=english ? "Glass Desk Calendar" : "桌面月历";
            showMenu.Text=english ? "Show as window" : "显示为窗口";
            pinMenu.Text=english ? "Pin to desktop" : "固定在桌面";
            exitMenu.Text=english ? "Quit calendar" : "退出月历";
            pinMenu.Checked=position!=null && position.Pinned;
        }
        public void ShowAsWindow()
        {
            if (position==null || closing) return;
            SetPinned(false); Show(); Activate(); DesktopPlacement.SetForegroundWindow(new WindowInteropHelper(this).Handle); view.Focus();
        }
        void SetPinned(bool pin)
        {
            if (position==null) return;
            bool ok=position.Pin(pin); wantedPin=position.Pinned;
            UpdateDockLayer();
            TrayText(); SaveState(); SendState();
            if (!ok) tray.ShowBalloonTip(3500,tray.Text,english ? "The Windows desktop is unavailable. Calendar is open as a window." : "暂时无法连接 Windows 桌面，月历已用窗口模式打开。",Forms.ToolTipIcon.Info);
        }
        void UpdateDockLayer()
        {
            if (dock==null) return;
            // A floating folder follows its calendar. An independent pinned folder
            // must remain available even when Windows minimizes the calendar.
            dock.Owner=position.Pinned ? null : this;
            dock.Topmost=position.Pinned;
        }
        void SendState()
        {
            if (view.CoreWebView2!=null && view.CoreWebView2.Source==Address)
                view.CoreWebView2.PostWebMessageAsString(position.Pinned ? "pinned" : "floating");
        }

        async void OpenPage(object sender,RoutedEventArgs e)
        {
            try {
                int testPort=0;
                bool testing = isolatedProfile && int.TryParse(Environment.GetEnvironmentVariable("GLASS_CALENDAR_TEST_PORT"),out testPort) && testPort>1024 && testPort<65536;
                var options=new CoreWebView2EnvironmentOptions();
                if (testing)
                    options.AdditionalBrowserArguments="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+testPort.ToString(CultureInfo.InvariantCulture);
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(folder,"WebView2"),options);
                environment=env;
                await view.EnsureCoreWebView2Async(env);
                if (closing) return;
                var core=view.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("calendar.example",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.Deny);
                core.Settings.AreDevToolsEnabled=testing; core.Settings.IsStatusBarEnabled=false;
                core.Settings.AreDefaultContextMenusEnabled=false; core.Settings.IsZoomControlEnabled=false;
                core.Settings.AreHostObjectsAllowed=false;
                core.NavigationStarting += delegate(object s,CoreWebView2NavigationStartingEventArgs a) { if (a.Uri!=Address) a.Cancel=true; };
                core.NewWindowRequested += delegate(object s,CoreWebView2NewWindowRequestedEventArgs a) {
                    a.Handled=true;
                    Uri target;
                    if (a.IsUserInitiated && Uri.TryCreate(a.Uri,UriKind.Absolute,out target) && target.Scheme=="https" &&
                        (target.Host.EndsWith(".gov.cn",StringComparison.OrdinalIgnoreCase) || target.Host=="www.opm.gov"))
                        Process.Start(new ProcessStartInfo(target.AbsoluteUri){UseShellExecute=true});
                };
                core.WebMessageReceived+=OnMessage;
                string exportFolder=isolatedProfile ? folder : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                exporter = new RecordExport(this,core,exportFolder,delegate { return !closing && core.Source==Address; },Log);
                core.NavigationCompleted += delegate(object s,CoreWebView2NavigationCompletedEventArgs a) {
                    if (a.IsSuccess) SendState();
                };
                SetPinned(wantedPin);
                core.Navigate(Address);
                dock=new ProjectDockWindow(env,delegate{return position.RestoredBounds;},delegate(string id){
                    if(closing)return;
                    core.PostWebMessageAsString("open-note|"+id);
                },Log);
                UpdateDockLayer();
                dock.Show();
            } catch (WebView2RuntimeNotFoundException ex) {
                Log(ex);
                if (MessageBox.Show("桌面月历需要 Microsoft Edge WebView2 Runtime。现在打开微软下载页？","Glass Desk Calendar",MessageBoxButton.YesNo,MessageBoxImage.Information)==MessageBoxResult.Yes)
                    Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/"){UseShellExecute=true});
                Close();
            } catch (Exception ex) {
                Log(ex); MessageBox.Show("月历未能启动。\n"+ex.Message,"Glass Desk Calendar",MessageBoxButton.OK,MessageBoxImage.Error); Close();
            }
        }
        void OpenNote(string command)
        {
            string[] parts=command.Split('|');
            int x,y,w,h;
            if (parts.Length!=6 || parts[1].Length==0 || parts[1].Length>200 ||
                !int.TryParse(parts[2],out x) || !int.TryParse(parts[3],out y) ||
                !int.TryParse(parts[4],out w) || !int.TryParse(parts[5],out h)) return;
            string id=Uri.UnescapeDataString(parts[1]);
            NoteWindow editor;
            if (notes.TryGetValue(id,out editor)) { editor.Raise(); return; }
            double scale=position.Scale;
            Rectangle frame=position.RestoredBounds;
            var bounds=new Rectangle(frame.Left+(int)Math.Round(x*scale),frame.Top+(int)Math.Round(y*scale),
                Math.Max(1,(int)Math.Round(w*scale)),Math.Max(1,(int)Math.Round(h*scale)));
            editor=new NoteWindow(environment,id,bounds,delegate {exitRequested=false;},Log);
            notes.Add(id,editor);
            editor.Closed+=delegate {
                notes.Remove(id);
                if (exitRequested) Dispatcher.BeginInvoke(new Action(Close));
            };
            editor.Show(); editor.Raise();
        }
        void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (closing || position==null || e.Source!=Address) return;
            string cmd;
            try { cmd=e.TryGetWebMessageAsString(); } catch (ArgumentException) { return; }
            if (cmd=="state") SendState();
            else if (cmd=="pin" || cmd=="float") SetPinned(cmd=="pin");
            else if (cmd=="quit") Dispatcher.BeginInvoke(new Action(Close));
            else if (cmd.StartsWith("edit-note|",StringComparison.Ordinal)) OpenNote(cmd);
            else if (cmd.StartsWith("export|",StringComparison.Ordinal)) {
                Dispatcher.BeginInvoke(new Action(delegate { exporter.Save(cmd,english); }));
            }
            else if (cmd=="reset-size") { position.Place(position.DefaultBounds()); SaveState(); }
            else if (cmd=="lang=en-US" || cmd=="lang=zh-CN") { english=cmd=="lang=en-US"; TrayText(); }
            else if (cmd.StartsWith("drag=",StringComparison.Ordinal)) Dispatcher.BeginInvoke(new Action(delegate { if(!closing)position.BeginDrag(cmd.Substring(5)); }));
            else {
                string[] pair=cmd.Split('='); int dip;
                if (pair.Length==2 && (pair[0]=="width" || pair[0]=="height") && int.TryParse(pair[1],out dip) && dip>0 && dip<=65535) position.Resize(pair[0],dip);
            }
        }
    }
}
