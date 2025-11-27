; NSIS Installer Script for Blockd Browser
; Copyright 2025 The Blockd Authors. All rights reserved.

!define PRODUCT_NAME "Blockd Browser"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Blockd Inc."
!define PRODUCT_WEB_SITE "https://blockd.com"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\blocked.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; MUI 1.67 compatible ------
!include "MUI2.nsh"

; MUI Settings
!define MUI_ABORTWARNING
!define MUI_ICON "resources\app_icon.ico"
!define MUI_UNICON "resources\uninstall_icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "resources\welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "resources\header.bmp"

; Welcome page
!insertmacro MUI_PAGE_WELCOME

; License page
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"

; Directory page
!insertmacro MUI_PAGE_DIRECTORY

; Instfiles page
!insertmacro MUI_PAGE_INSTFILES

; Finish page
!define MUI_FINISHPAGE_RUN "$INSTDIR\blocked.exe"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_INSTFILES

; Language files
!insertmacro MUI_LANGUAGE "English"

; MUI end ------

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "BlockedBrowser_Setup_v${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\Blockd Browser"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

; Request administrator privileges
RequestExecutionLevel admin

; Version information
VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright 2025 ${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Installer"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite ifnewer

  ; Core browser files
  File /r "out\Release\*.*"

  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\Blockd Browser"
  CreateShortCut "$SMPROGRAMS\Blockd Browser\Blockd Browser.lnk" "$INSTDIR\blocked.exe"
  CreateShortCut "$DESKTOP\Blockd Browser.lnk" "$INSTDIR\blocked.exe"

  ; Create quick launch shortcut
  CreateShortCut "$QUICKLAUNCH\Blockd Browser.lnk" "$INSTDIR\blocked.exe"

  ; Set default browser prompt (optional)
  ; WriteRegStr HKLM "Software\RegisteredApplications" "Blockd Browser" "Software\Clients\StartMenuInternet\BLOCKED.EXE\Capabilities"

SectionEnd

Section -AdditionalIcons
  WriteIniStr "$INSTDIR\${PRODUCT_NAME}.url" "InternetShortcut" "URL" "${PRODUCT_WEB_SITE}"
  CreateShortCut "$SMPROGRAMS\Blockd Browser\Website.lnk" "$INSTDIR\${PRODUCT_NAME}.url"
  CreateShortCut "$SMPROGRAMS\Blockd Browser\Uninstall.lnk" "$INSTDIR\uninst.exe"
SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\blocked.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "$(^Name)"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\blocked.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"

  ; Register with Google Update (Omaha)
  WriteRegStr HKLM "Software\Google\Update\Clients\{BLOCKD-GUID-HERE}" "pv" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Google\Update\Clients\{BLOCKD-GUID-HERE}" "name" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Google\Update\Clients\{BLOCKD-GUID-HERE}" "lang" "en"

SectionEnd

Function un.onUninstSuccess
  HideWindow
  MessageBox MB_ICONINFORMATION|MB_OK "$(^Name) was successfully removed from your computer."
FunctionEnd

Function un.onInit
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Are you sure you want to completely remove $(^Name) and all of its components?" IDYES +2
  Abort
FunctionEnd

Section Uninstall
  Delete "$INSTDIR\${PRODUCT_NAME}.url"
  Delete "$INSTDIR\uninst.exe"

  ; Remove all files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\Blockd Browser\Uninstall.lnk"
  Delete "$SMPROGRAMS\Blockd Browser\Website.lnk"
  Delete "$DESKTOP\Blockd Browser.lnk"
  Delete "$SMPROGRAMS\Blockd Browser\Blockd Browser.lnk"
  Delete "$QUICKLAUNCH\Blockd Browser.lnk"

  RMDir "$SMPROGRAMS\Blockd Browser"

  ; Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  DeleteRegKey HKLM "Software\Google\Update\Clients\{BLOCKD-GUID-HERE}"

  SetAutoClose true
SectionEnd
