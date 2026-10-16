# Shade Inactive Windows Reborn

(Tiếng Việt bên dưới)

A modernized GNOME Shell extension that dims/shades inactive windows to help you focus on your active workspace. You can also amplify the drop shadow on the active window to make it pop.

## Screenshot

<img src="screenshot.webp" alt="Shade Inactive Windows Reborn Screenshot" width="60%">

## Features & Improvements

* **Modern Codebase**: Completely rewritten for modern GNOME Shell versions (45 and above).
* **Customizable Shading & Transitions**: Adjust the dimming/shade level of inactive windows and transition animation duration.
* **App Exclusion**: Easily exempt specific applications from being shaded.
* **Enhanced Focus**: Boost the drop shadow of the active window to make it truly stand out.

## Installation

**[Get it on GNOME Extensions](https://extensions.gnome.org/extension/10871/shade-inactive-windows-reborn/)**

### Method 1: Install via Extension Manager (Recommended)

To install using Extension Manager via Flatpak, ensure [Flatpak is installed](https://docs.flatpak.org/en/latest/using-flatpak.html) and the Flathub remote is configured on your system first:

1. Add the Flathub remote if not already present:
   ```bash
   flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
   ```
2. Install [Extension Manager (`com.mattjakeman.ExtensionManager`)](https://flathub.org/en/apps/com.mattjakeman.ExtensionManager):
   ```bash
   flatpak install flathub com.mattjakeman.ExtensionManager
   ```
3. Open **Extension Manager**, switch to the **Browse** tab, search for **Shade Inactive Windows Reborn**, and click **Install**.

---

### Method 2: Install from Source (Development / Testing)

Refer to authoritative GNOME extension development documentation at [gjs.guide](https://gjs.guide/extensions/development/creating.html) for details on UUID directories and extension lifecycle.

#### Prerequisites

* GNOME Shell 45 or later
* `glib-compile-schemas` (provided by `libglib2.0-bin` on Debian/Ubuntu or `glib2-devel` on Fedora)
* `gnome-extensions` CLI (included with `gnome-shell`)

> **Note:** The commands below require an active GNOME Shell environment with GJS and GLib development tools installed.

#### 1. Clone & Link Extension Directory

Local user extensions are located at `~/.local/share/gnome-shell/extensions/<uuid>`. The UUID for this extension is `shade-inactive-windows-reborn@binhnguyensoft.com` (from `metadata.json`).

```bash
# Create local extensions directory if it doesn't exist
mkdir -p ~/.local/share/gnome-shell/extensions

# Symlink this repository checkout to the UUID directory
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/shade-inactive-windows-reborn@binhnguyensoft.com
```

#### 2. Compile GSettings Schema

The extension configuration is defined in `schemas/org.gnome.shell.extensions.shade-inactive-windows-reborn.gschema.xml`. Compile schemas in the `schemas/` directory:

```bash
glib-compile-schemas schemas/
```

#### 3. Reload GNOME Shell Session

* **X11 Session**: Press `Alt + F2`, type `r`, and press `Enter`.
* **Wayland Session**: Log out and log back in, or run a nested GNOME Shell test instance:
  ```bash
  dbus-run-session -- gnome-shell --nested --wayland
  ```

#### 4. Enable the Extension

```bash
gnome-extensions enable shade-inactive-windows-reborn@binhnguyensoft.com
```

To open preferences:
```bash
gnome-extensions prefs shade-inactive-windows-reborn@binhnguyensoft.com
```

#### Manual Validation Checklist

Follow this checklist to verify extension functionality:
- [ ] **Inactive-window shading**: Unfocused windows visibly dim according to the configured shade level.
- [ ] **Focus transitions**: Switching between windows smoothly animates the shade transition.
- [ ] **Exclusions**: Applications added to the exclusion list remain unshaded even when inactive.
- [ ] **Preferences**: Opening extension preferences allows adjusting shade level, transition duration, exclusion list, and drop shadow boost.
- [ ] **Disabling extension**: Running `gnome-extensions disable shade-inactive-windows-reborn@binhnguyensoft.com` removes shading and restores normal window appearance.

## Acknowledgements & Credits

This project is completely rewritten based on the concept of Shade Inactive Windows, originally created by [hepaajan](https://github.com/hepaajan/shade-inactive-windows).

Special thanks to **Just Perfection** and the **GNOME Shell Extensions review team** for their thoughtful reviews and constructive feedback.

## License

GNU General Public License v3.0 or later.

---
## Tiếng Việt

Tiện ích mở rộng GNOME Shell giúp làm mờ/làm tối các cửa sổ không hoạt động, giúp bạn tập trung tối đa vào không gian làm việc hiện tại. Bạn cũng có thể tăng bóng đổ cho cửa sổ active để làm nó nổi bật hơn.

## Ảnh chụp màn hình

<img src="screenshot.webp" alt="Shade Inactive Windows Reborn Screenshot" width="60%">

## Tính năng & Cải tiến

* **Viết lại mã nguồn**: viết lại theo chuẩn GJS mới cho các phiên bản GNOME Shell đời mới (từ 45 trở lên).
* **Tùy chỉnh độ tối & thời gian hiệu ứng làm tối**: cho phép điều chỉnh mức độ hiệu ứng làm tối và thời gian chạy hiệu ứng.
* **Ứng dụng ngoại lệ**: cho phép chỉ định các app ngoại lệ không bị làm tối, hữu ích cho các app như xem ảnh, xem tài liệu,...
* **Tăng bóng đổ**: tăng cường bóng đổ cho cửa sổ đang hoạt động để làm nó nổi bật hơn.

## Cài đặt

**[Tải trên trang GNOME Extensions](https://extensions.gnome.org/extension/10871/shade-inactive-windows-reborn/)**

### Cách 1: Cài đặt thông qua Extension Manager (Khuyên dùng)

Để cài đặt bằng Extension Manager qua Flatpak, hãy đảm bảo hệ thống của bạn đã [cài đặt Flatpak](https://docs.flatpak.org/en/latest/using-flatpak.html) và cấu hình nguồn Flathub:

1. Thêm nguồn Flathub nếu chưa có:
   ```bash
   flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
   ```
2. Cài đặt [Extension Manager (`com.mattjakeman.ExtensionManager`)](https://flathub.org/en/apps/com.mattjakeman.ExtensionManager):
   ```bash
   flatpak install flathub com.mattjakeman.ExtensionManager
   ```
3. Mở ứng dụng **Extension Manager**, chuyển sang tab **Browse**, tìm kiếm **Shade Inactive Windows Reborn**, và nhấn **Install**.

---

### Cách 2: Cài đặt từ mã nguồn (Phát triển / Thử nghiệm)

Tham khảo tài liệu phát triển extension chính thức của GNOME tại [gjs.guide](https://gjs.guide/extensions/development/creating.html) để biết thêm chi tiết về cấu trúc thư mục UUID và vòng đời extension.

#### Điều kiện tiên quyết

* GNOME Shell 45 trở lên
* Công cụ `glib-compile-schemas` (gói `libglib2.0-bin` trên Debian/Ubuntu hoặc `glib2-devel` trên Fedora)
* Công cụ dòng lệnh `gnome-extensions` (đi kèm với `gnome-shell`)

> **Lưu ý:** Các câu lệnh dưới đây yêu cầu môi trường desktop GNOME Shell đang hoạt động cùng với các công cụ phát triển GJS và GLib.

#### 1. Tạo liên kết thư mục Extension

Thư mục extension của người dùng nằm tại `~/.local/share/gnome-shell/extensions/<uuid>`. UUID của tiện ích này là `shade-inactive-windows-reborn@binhnguyensoft.com` (theo `metadata.json`).

```bash
# Tạo thư mục extensions nếu chưa có
mkdir -p ~/.local/share/gnome-shell/extensions

# Tạo liên kết tượng trưng (symlink) từ mã nguồn tới thư mục UUID
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/shade-inactive-windows-reborn@binhnguyensoft.com
```

#### 2. Biên dịch GSettings Schema

Cấu hình của extension được định nghĩa trong tệp `schemas/org.gnome.shell.extensions.shade-inactive-windows-reborn.gschema.xml`. Biên dịch schema trong thư mục `schemas/`:

```bash
glib-compile-schemas schemas/
```

#### 3. Tải lại phiên GNOME Shell

* **Phiên X11**: Nhấn tổ hợp phím `Alt + F2`, gõ `r`, và nhấn `Enter`.
* **Phiên Wayland**: Đăng xuất và đăng nhập lại, hoặc khởi chạy phiên thử nghiệm GNOME Shell lồng nhau:
  ```bash
  dbus-run-session -- gnome-shell --nested --wayland
  ```

#### 4. Kích hoạt Extension

```bash
gnome-extensions enable shade-inactive-windows-reborn@binhnguyensoft.com
```

Để mở giao diện tùy chỉnh:
```bash
gnome-extensions prefs shade-inactive-windows-reborn@binhnguyensoft.com
```

#### Danh sách kiểm tra thử nghiệm thủ công

Thực hiện kiểm tra theo danh sách sau để xác nhận hoạt động của tiện ích:
- [ ] **Làm tối cửa sổ không hoạt động**: Cửa sổ không có tiêu điểm (inactive) được làm mờ/làm tối theo mức độ đã thiết lập.
- [ ] **Hiệu ứng chuyển đổi tiêu điểm**: Chuyển đổi qua lại giữa các cửa sổ diễn ra mượt mà cùng hiệu ứng làm mờ.
- [ ] **Ứng dụng ngoại lệ**: Các ứng dụng trong danh sách ngoại lệ không bị làm tối khi không có tiêu điểm.
- [ ] **Tùy chỉnh cấu hình**: Mở cửa sổ cấu hình và thay đổi độ tối, thời gian hiệu ứng, danh sách ngoại lệ và tăng bóng đổ hoạt động chính xác.
- [ ] **Vô hiệu hóa extension**: Chạy `gnome-extensions disable shade-inactive-windows-reborn@binhnguyensoft.com` tắt toàn bộ hiệu ứng làm mờ và khôi phục giao diện cửa sổ bình thường.

## Lời cảm ơn & Ghi nhận

Dự án này được viết lại dựa trên ý tưởng từ extension gốc Shade Inactive Windows, ban đầu được tạo bởi [hepaajan](https://github.com/hepaajan/shade-inactive-windows).

Xin gửi lời cảm ơn đặc biệt đến **đội ngũ kiểm duyệt GNOME Extensions**, đặc biệt là **Just Perfection**, vì những góp ý và sự hỗ trợ trong quá trình duyệt extension.

## Giấy phép

Giấy phép Công cộng GNU phiên bản 3.0 (GPL-3.0) hoặc mới hơn.
