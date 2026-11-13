; Puts the app's bin folder (otea.cmd for cmd and PowerShell, otea for Git Bash) on the user's PATH
; when Otea is installed, and takes it off when Otea is uninstalled, but not when an update
; replaces it. path.ps1 changes only the user's PATH, only that entry. It is packed into the
; installer and the uninstaller themselves: when the uninstaller runs, the app's files may be gone.

!macro oteaPath ACTION
  InitPluginsDir
  File "/oname=$PLUGINSDIR\otea-path.ps1" "${BUILD_RESOURCES_DIR}\path.ps1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\otea-path.ps1" -Action ${ACTION} -Dir "$INSTDIR\resources\bin"'
  Pop $0
!macroend

!macro customInstall
  !insertmacro oteaPath add
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro oteaPath remove
  ${endIf}
!macroend
