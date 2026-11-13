#!/bin/bash
# The deb's postinst: what electron-builder's own does for the app (its launcher on PATH, the
# Chromium sandbox, the menu entry), plus the otea command on PATH, which runs the CLI the app
# carries on the app's own Electron (resources/bin/otea).
ln -sf '/opt/Otea/otea-desktop' '/usr/bin/otea-desktop'
chmod 755 '/opt/Otea/resources/bin/otea' || true
ln -sf '/opt/Otea/resources/bin/otea' '/usr/bin/otea'
# The SUID sandbox Electron needs where unprivileged user namespaces are off.
chmod 4755 '/opt/Otea/chrome-sandbox' || true
if hash update-mime-database 2>/dev/null; then
  update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications || true
fi
