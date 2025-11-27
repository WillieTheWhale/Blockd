Name:           blockd-browser
Version:        1.0.0
Release:        1%{?dist}
Summary:        Blockd Browser - Secure Interview Browser

License:        Proprietary
URL:            https://blockd.com
Source0:        %{name}-%{version}.tar.gz

BuildArch:      x86_64
Requires:       ca-certificates, liberation-fonts, alsa-lib >= 1.0.17, atk >= 2.2.0, cairo >= 1.6.0, cups-libs >= 1.6.0, dbus-libs >= 1.5.12, expat >= 2.0.1, glib2 >= 2.39.4, gtk3 >= 3.9.10, libdrm >= 2.4.60, libX11 >= 1.4.99.1, libxcb >= 1.9.2, libXcomposite >= 0.4.4, libXdamage >= 1.1, libXext, libXfixes, libXrandr, libxkbcommon >= 0.4.1, nspr >= 4.9, nss >= 3.22, pango >= 1.14.0

%description
Blockd Browser is a specialized Chromium-based browser designed for
conducting secure online interviews with built-in AI-powered anti-cheating
detection, eye tracking, and comprehensive security monitoring.

This browser includes:
 - Real-time eye tracking and gaze analysis
 - AI-powered answer detection
 - Process and screen recording detection
 - Virtual machine detection
 - Secure fullscreen mode during interviews
 - Video and audio recording capabilities

%prep
%setup -q

%build
# Build is done separately

%install
rm -rf %{buildroot}

# Create directories
mkdir -p %{buildroot}/opt/blockd-browser
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/256x256/apps
mkdir -p %{buildroot}%{_bindir}

# Install browser files
cp -r out/Release/* %{buildroot}/opt/blockd-browser/

# Install desktop file
cp installer/linux/blocked.desktop %{buildroot}%{_datadir}/applications/

# Install icon
cp resources/app_icon_256.png %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/blockd-browser.png

# Create symlink
ln -s /opt/blockd-browser/blocked %{buildroot}%{_bindir}/blockd-browser

%files
/opt/blockd-browser/
%{_datadir}/applications/blocked.desktop
%{_datadir}/icons/hicolor/256x256/apps/blockd-browser.png
%{_bindir}/blockd-browser

%post
# Set SUID sandbox permissions
chmod 4755 /opt/blockd-browser/chrome-sandbox || true

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q
fi

# Update icon cache
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -f %{_datadir}/icons/hicolor || true
fi

echo "Blockd Browser installed successfully!"

%postun
# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q
fi

# Update icon cache
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -f %{_datadir}/icons/hicolor || true
fi

%changelog
* Mon Nov 24 2025 Blockd Inc. <support@blockd.com> - 1.0.0-1
- Initial release
