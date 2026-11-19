# 桌面月历 · Glass Desk Calendar

在 Windows 桌面上点一个日期就能写待办。月历按天排列，支持图文笔记、年览、透明度调节和中英双语。

当月日期各自保留圆角和间距，月初、月末露出的相邻月份日期连成一条浅色带。每一天都可以独立点写。日期数字固定为深蓝色，今天用圆框标记。

[查看各版本的修改记录](CHANGELOG.md)

## 下载和打开

在 [Releases](https://github.com/gooutright/glass-desk-calendar/releases/latest) 下载 Windows x64 版本。

- **安装版**　双击 `GlassDeskCalendar-1.3.2-win-x64.msi`。安装完成后，双击桌面的「桌面月历」，也可以从开始菜单打开 Glass Desk Calendar。
- **便携版**　解压 `GlassDeskCalendar-1.3.2-win-x64-portable.zip`，双击其中的 `GlassDeskCalendar.exe`。程序和同一文件夹里的组件需要放在一起。

适用于 Windows 10 22H2 和 Windows 11 的 x64 系统。程序使用 .NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。在 Windows 11 上使用系统已有的运行组件。在缺少 WebView2 的电脑上，请安装微软的 [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

## 使用

- **记一条待办**　点击日期格开始输入，回车继续写下一条。点击复选框标记完成。
- **按项目记便签**　在「年览」旁边点「便签项目」，选颜色、填名称并创建项目。之后写的便签带有这个项目的彩色圆点，点圆点可以勾选完成。旧便签可以在「编辑」里选择项目。
- **摆放项目文件夹**　桌面右侧每个项目都有自己的文件夹，夹面和夹舌一起使用项目色。按住某个文件夹上下拖，松手即可单独记住它的位置。文件夹之间的空白可以直接点击桌面。单击文件夹向左展开该项目所有日期的便签，再点一条打开笔记。再次单击或按 Esc 收起，项目多时可用滚轮浏览。
- **写详细笔记**　右键待办，选择「编辑」。笔记会在约三格宽、三格高的独立窗口打开。按住顶部日期栏可拖到桌面其他位置。可以同时打开多篇笔记，切到其他软件，再回来继续写。在光标处按 Ctrl+V 粘贴截图，也可以点「插入图片」或拖入照片。点击缩略图可查看原图。
- **标出重点**　选中文字，在正文下方调整字号、加粗、加下划线、改文字颜色或画荧光笔。没有选中文字时，格式用于接下来输入的字。点色块可以换颜色，再点同色的荧光笔按钮可以擦除底色。编辑结束点「保存」。
- **调整桌面布局**　拖动月份标题移动月历，拖动窗口边缘或四角调整大小。设置里的「日历字号」调年月、星期和日期，「便签字号」调清单、项目便签和笔记默认正文。还可以调宽度、高度和行距。右上角滑块控制玻璃面板的透明度。
- **切换窗口模式**　首次打开时，项目文件夹浮在月历上方，其他应用可以盖住它们。在设置中勾选「固定在桌面」后，月历留在桌面，右侧文件夹和展开的便签列表会显示在普通应用上方。可以按 Win+D 查看月历，也可以直接点击右侧文件夹打开笔记。详细笔记可以独立移动和切换。托盘菜单可以退出。
- **切换月份和语言**　用左右箭头翻月，「今天」回到当前月份。「年览」可从全年跳到某一天。中文显示已收录的中国大陆放假、调休上班安排，英文显示美国联邦假日和补休日。周末和相邻月份有独立标记。
- **读节日标记**　节名紧跟日期数字，使用浅绿色标签。调休上班有「班」标记。周六和周日由表头标识。
- **导出**　在设置中选「导出记录」保存 CSV。选「导出图文与格式 HTML」可以把标注、文字和原图一起保存，离线也能打开。

## 本地数据

程序离线运行，待办、笔记、图片和设置存放在当前 Windows 用户的 `%LOCALAPPDATA%\GlassDeskCalendar`。安装版和便携版在同一 Windows 账号下共用这份数据。退出后可以完整备份此目录。卸载通过 Windows 的「已安装的应用」进行，个人笔记保留。

浏览器样稿使用浏览器自己的存储。正式版首次启动使用独立资料目录。如需保留样稿中的内容，先在原浏览器的设置里导出。

## 构建和验证

在 Windows x64 上从项目根目录运行。构建脚本调用 .NET Framework 自带的 C# 编译器，下载并校验固定版本的 WebView2 SDK 和 WiX。生成文件位于 `dist`，包括 MSI、便携 ZIP 和 SHA-256 校验值。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

要运行桌面集成测试，安装 Python 3.10 以上和 Playwright Python 包。测试使用应用自己的 WebView2，在临时资料目录中运行。

```powershell
python -m pip install playwright
python tests/desktop_smoke.py
python tests/project_notes_smoke.py
python tests/note_format_smoke.py
python tests/floating_notes_smoke.py
python tests/project_layer_smoke.py
python tests/frame_probe.py --rounds 3
```

页面为后续本地扩展预留了 `window.CalendarActions`，支持 `list()`、`add(date, title, projectId?)`、`update(id, {text, done, projectId})` 和 `remove(id)`。本版使用本地调用，未接入 AI 服务。

笔记编辑使用随应用分发的 Quill 2.0.3，断网也能编辑。[Quill 许可](web/vendor/Quill-LICENSE.txt)
