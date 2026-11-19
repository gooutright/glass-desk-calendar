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
        [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref Point p);
        [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
        [DllImport("kernel32.dll",EntryPoint="SetLastError")] static extern void ClearLastError(uint error);
        [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr hwnd, IntPtr parent);
        [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll", EntryPoint="SetWindowLongW")] static extern int SetWindowLong(IntPtr hwnd, int index, int style);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
        [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hwnd);
        const int Style = -16, Child = 0x40000000, Popup = unchecked((int)0x80000000);
        const uint NoZOrder = 4, NoActivate = 16, FrameChanged = 32;
        readonly IntPtr window;
        readonly DispatcherTimer dragging = new DispatcherTimer(DispatcherPriority.Input);
        readonly Action save;
        readonly int minimumWidth, minimumHeight;
        Point dragOrigin;
        Rectangle initial;
        string handle;
        int floatingStyle;
        public bool Pinned { get; private set; }
        public double Scale { get { return Math.Max(96u, GetDpiForWindow(window)) / 96.0; } }
        public Rectangle Bounds { get { Rect r; GetWindowRect(window, out r); return Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom); } }
        public DesktopPlacement(IntPtr hwnd, Action onFinish, int minWidth=350, int minHeight=320)
        {
            window = hwnd; save = onFinish;
            minimumWidth=minWidth; minimumHeight=minHeight;
            dragging.Interval = TimeSpan.FromMilliseconds(16);
            dragging.Tick += DragTick;
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
        public void Place(Rectangle rect) { Position(Fit(rect),false); }
        void Position(Rectangle rect, bool top)
        {
            Rectangle current = Bounds;
            if (!top && current==rect) return;
            Point point = rect.Location;
            if (Pinned) ScreenToClient(GetParent(window),ref point);
            uint flags=NoActivate | (top ? FrameChanged : NoZOrder);
            if (current.Size==rect.Size) flags|=1; // SWP_NOSIZE: moving does not resize the WebView.
            SetWindowPos(window, IntPtr.Zero, point.X, point.Y, rect.Width, rect.Height, flags);
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
        public bool Pin(bool attach)
        {
            if (Pinned == attach) return true;
            IntPtr target = attach ? DesktopHost() : IntPtr.Zero;
            if (attach && target == IntPtr.Zero) return false;
            Rectangle previous = Bounds;
            if (attach) {
                floatingStyle = GetWindowLong(window,Style);
                SetWindowLong(window,Style,(floatingStyle & ~Popup) | Child);
            }
            // Win32 requires a child to be detached before its WS_CHILD bit is cleared.
            ClearLastError(0);
            IntPtr oldParent = SetParent(window,target);
            if (oldParent==IntPtr.Zero && Marshal.GetLastWin32Error()!=0) {
                if (attach) SetWindowLong(window,Style,floatingStyle);
                return false;
            }
            if (!attach) SetWindowLong(window,Style,floatingStyle);
            Pinned = attach;
            Position(Fit(previous),true);
            return true;
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
            if (Array.IndexOf(new[]{"move","n","s","e","w","ne","nw","se","sw"},edge)<0) return;
            if (GetAsyncKeyState(1)>=0) return;
            GetCursorPos(out dragOrigin); initial = Bounds; handle = edge;
            dragging.Start();
        }
        void DragTick(object sender,EventArgs e)
        {
            Point p; GetCursorPos(out p);
            int x=p.X-dragOrigin.X, y=p.Y-dragOrigin.Y;
            Rectangle rect=initial;
            if (handle=="move") rect.Offset(x,y);
            else {
                int left=initial.Left, top=initial.Top, right=initial.Right, bottom=initial.Bottom;
                int minW=(int)Math.Ceiling(350*Scale), minH=(int)Math.Ceiling(320*Scale);
                if (handle.Contains("w")) left=Math.Min(right-minW,left+x);
                if (handle.Contains("e")) right=Math.Max(left+minW,right+x);
                if (handle.Contains("n")) top=Math.Min(bottom-minH,top+y);
                if (handle.Contains("s")) bottom=Math.Max(top+minH,bottom+y);
                rect = Rectangle.FromLTRB(left,top,right,bottom);
            }
            Place(rect);
            if (GetAsyncKeyState(1)>=0) { dragging.Stop(); save(); }
        }
        public void Stop() { dragging.Stop(); }
    }
}
