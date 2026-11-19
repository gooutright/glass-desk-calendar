using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Windows.Threading;

namespace GlassDeskCalendar
{
    // All shell coordinates here are physical screen pixels, including on secondary monitors.
    internal sealed class DesktopPlacement
    {
        [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
        delegate bool WindowEnumerator(IntPtr hwnd, IntPtr parameter);
        [DllImport("user32.dll")] static extern bool EnumWindows(WindowEnumerator callback, IntPtr parameter);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string name, string title);
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
        [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd,uint message,IntPtr wParam,IntPtr lParam);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint direction);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
        delegate void ForegroundHandler(IntPtr hook,uint kind,IntPtr hwnd,int obj,int child,uint thread,uint time);
        [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,ForegroundHandler callback,uint process,uint thread,uint flags);
        [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
        [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int left,int top,int right,int bottom,int width,int height);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
        [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
        [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hwnd);
        const uint NoZOrder = 4, NoActivate = 16, NoMoveOrSize = 3;
        readonly IntPtr window;
        readonly DispatcherTimer dragging = new DispatcherTimer(DispatcherPriority.Input);
        readonly DispatcherTimer desktopTransition = new DispatcherTimer();
        readonly ForegroundHandler foregroundChanged;
        IntPtr foregroundHook;
        readonly Action save;
        readonly int minimumWidth, minimumHeight, cornerRadius;
        Size clippedSize;
        int clippedRadius;
        Point dragOrigin;
        Rectangle initial;
        string handle;
        public bool Pinned { get; private set; }
        public double Scale { get { return Math.Max(96u, GetDpiForWindow(window)) / 96.0; } }
        public Rectangle Bounds { get { Rect r; GetWindowRect(window, out r); return Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom); } }
        public DesktopPlacement(IntPtr hwnd, Action onFinish, int minWidth=350, int minHeight=320, int radius=0)
        {
            window = hwnd; save = onFinish;
            minimumWidth=minWidth; minimumHeight=minHeight; cornerRadius=radius;
            dragging.Interval = TimeSpan.FromMilliseconds(16);
            dragging.Tick += DragTick;
            foregroundChanged=delegate {
                desktopTransition.Stop(); desktopTransition.Start();
            };
            desktopTransition.Interval=TimeSpan.FromMilliseconds(120);
            desktopTransition.Tick+=delegate { desktopTransition.Stop(); ApplyDesktopLayer(); };
        }
        public Rectangle DefaultBounds()
        {
            Rectangle work = Screen.FromHandle(window).WorkingArea;
            int gap = (int)(20 * Scale);
            int width = Math.Min(work.Width, Math.Max((int)(350 * Scale), (int)(work.Width * .70)));
            int height = Math.Min(work.Height, Math.Max((int)(320 * Scale), (int)(work.Height * .73)));
            return Fit(new Rectangle(work.Right - gap - width, work.Top + gap, width, height));
        }
        Rectangle Fit(Rectangle box)
        {
            Rectangle work = Screen.FromRectangle(box).WorkingArea;
            box.Width = Math.Min(work.Width, Math.Max((int)Math.Ceiling(minimumWidth*Scale), box.Width));
            box.Height = Math.Min(work.Height, Math.Max((int)Math.Ceiling(minimumHeight*Scale), box.Height));
            box.X = Math.Min(work.Right-box.Width, Math.Max(work.Left,box.X));
            box.Y = Math.Min(work.Bottom-box.Height, Math.Max(work.Top,box.Y));
            return box;
        }
        public void Place(Rectangle rect)
        {
            rect=Fit(rect);
            Rectangle current = Bounds;
            if (cornerRadius>0) ClipCorners(rect.Size);
            if (current==rect) return;
            uint flags=NoActivate | NoZOrder;
            if (current.Size==rect.Size) flags|=1; // SWP_NOSIZE: moving does not resize the WebView.
            SetWindowPos(window,IntPtr.Zero,rect.Left,rect.Top,rect.Width,rect.Height,flags);
        }
        void ClipCorners(Size size)
        {
            int radius=(int)Math.Round(cornerRadius*Scale);
            if (size==clippedSize && radius==clippedRadius) return;
            IntPtr region=CreateRoundRectRgn(0,0,size.Width+1,size.Height+1,2*radius,2*radius);
            if (region==IntPtr.Zero) return;
            // Windows owns a successfully installed region, including its hit-test boundary.
            if (SetWindowRgn(window,region,true)==0) DeleteObject(region);
            else { clippedSize=size; clippedRadius=radius; }
        }
        static IntPtr DesktopHost()
        {
            IntPtr host = IntPtr.Zero;
            EnumWindows(delegate(IntPtr candidate, IntPtr ignored) {
                if (FindWindowEx(candidate,IntPtr.Zero,"SHELLDLL_DefView",null) == IntPtr.Zero) return true;
                host = candidate; return false;
            },IntPtr.Zero);
            return host;
        }
        void ApplyDesktopLayer()
        {
            if (!Pinned) return;
            IntPtr host=DesktopHost(), foreground=GetForegroundWindow();
            if (host==IntPtr.Zero || foreground==window) return;
            bool atDesktop=foreground==host || foreground==GetShellWindow();
            if (atDesktop && (IsIconic(window)||!IsWindowVisible(window))) ShowWindow(window,4); // SW_SHOWNOACTIVATE
            if (!IsWindowVisible(window) || IsIconic(window)) return;
            IntPtr above=atDesktop ? IntPtr.Zero : GetWindow(host,3); // GW_HWNDPREV
            if (above==window) return;
            if (above!=IntPtr.Zero && (GetWindowLong(above,-20)&8)!=0) above=IntPtr.Zero;
            SetWindowPos(window,above,0,0,0,0,NoMoveOrSize|NoActivate);
        }
        public bool Pin(bool pin)
        {
            if (Pinned==pin) return true;
            if (!pin) { StopDesktopTracking(); return true; }
            if (DesktopHost()==IntPtr.Zero) return false;
            // Observe foreground changes only. Explorer must never be the parent or
            // modal owner of our UI, even while a file picker is open.
            foregroundHook=SetWinEventHook(3,3,IntPtr.Zero,foregroundChanged,0,0,0);
            if (foregroundHook==IntPtr.Zero) return false;
            Pinned=true; ApplyDesktopLayer();
            return true;
        }
        void StopDesktopTracking()
        {
            Pinned=false; desktopTransition.Stop();
            if (foregroundHook!=IntPtr.Zero) { UnhookWinEvent(foregroundHook); foregroundHook=IntPtr.Zero; }
        }
        public void Resize(string dimension,int dips)
        {
            Rectangle rect = Bounds;
            int pixels = (int)Math.Round(dips*Scale);
            if (dimension=="width") rect.Width = pixels; else rect.Height = pixels;
            Place(rect); save();
        }
        public void BeginDrag(string edge)
        {
            if (Array.IndexOf(new[]{"move","rail","n","s","e","w","ne","nw","se","sw"},edge)<0) return;
            if (GetAsyncKeyState(1)>=0) return;
            if (edge=="move") {
                // Let the compositor move an ordinary window at the display cadence.
                ReleaseCapture();
                SendMessage(window,0x0112,new IntPtr(0xF012),IntPtr.Zero); // WM_SYSCOMMAND, SC_MOVE | HTCAPTION
                Place(Bounds); save(); return;
            }
            GetCursorPos(out dragOrigin); initial = Bounds; handle = edge; draggingRail=false;
            dragging.Start();
        }
        void DragTick(object sender,EventArgs e)
        {
            Point p; GetCursorPos(out p);
            int x=p.X-dragOrigin.X, y=p.Y-dragOrigin.Y;
            Rectangle rect=initial;
            if (handle=="move") rect.Offset(x,y);
            else if (handle=="rail") {
                if (!draggingRail && Math.Abs(y)>=5*Scale) draggingRail=true;
                if (!draggingRail) {
                    // A normal click may already have expanded the rail. Do not restore
                    // the folded rectangle on button-up.
                    if (GetAsyncKeyState(1)>=0) dragging.Stop();
                    return;
                }
                Rectangle work=Screen.FromRectangle(initial).WorkingArea;
                rect.Y=Math.Max(work.Top, Math.Min(work.Bottom-initial.Height,initial.Top+y));
            }
            else {
                int left=initial.Left, top=initial.Top, right=initial.Right, bottom=initial.Bottom;
                int minW=(int)Math.Ceiling(minimumWidth*Scale), minH=(int)Math.Ceiling(minimumHeight*Scale);
                if (handle.Contains("w")) left=Math.Min(right-minW,left+x);
                if (handle.Contains("e")) right=Math.Max(left+minW,right+x);
                if (handle.Contains("n")) top=Math.Min(bottom-minH,top+y);
                if (handle.Contains("s")) bottom=Math.Max(top+minH,bottom+y);
                rect = Rectangle.FromLTRB(left,top,right,bottom);
            }
            Place(rect);
            if (GetAsyncKeyState(1)>=0) {
                dragging.Stop();
                if (handle!="rail" || draggingRail) save();
                draggingRail=false;
            }
        }
        bool draggingRail;
        public void Stop() { dragging.Stop(); StopDesktopTracking(); }
    }
}
