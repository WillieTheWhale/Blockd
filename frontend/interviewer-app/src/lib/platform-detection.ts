export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

export interface PlatformInfo {
  platform: Platform
  displayName: string
  icon: 'windows' | 'apple' | 'linux'
  downloadUrl: string
  fileName: string
  fileSize: string
}

const DOWNLOAD_BASE_URL = 'https://downloads.blockd.com'
export const CURRENT_VERSION = '1.0.0'

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  windows: {
    platform: 'windows',
    displayName: 'Windows',
    icon: 'windows',
    downloadUrl: `${DOWNLOAD_BASE_URL}/windows/BlockedBrowser_Setup_v${CURRENT_VERSION}.exe`,
    fileName: `BlockedBrowser_Setup_v${CURRENT_VERSION}.exe`,
    fileSize: '85 MB',
  },
  macos: {
    platform: 'macos',
    displayName: 'macOS',
    icon: 'apple',
    downloadUrl: `${DOWNLOAD_BASE_URL}/macos/BlockedBrowser-v${CURRENT_VERSION}.dmg`,
    fileName: `BlockedBrowser-v${CURRENT_VERSION}.dmg`,
    fileSize: '85 MB',
  },
  linux: {
    platform: 'linux',
    displayName: 'Linux',
    icon: 'linux',
    downloadUrl: `${DOWNLOAD_BASE_URL}/linux/BlockedBrowser-v${CURRENT_VERSION}.AppImage`,
    fileName: `BlockedBrowser-v${CURRENT_VERSION}.AppImage`,
    fileSize: '85 MB',
  },
  unknown: {
    platform: 'unknown',
    displayName: 'Unknown',
    icon: 'linux',
    downloadUrl: '',
    fileName: '',
    fileSize: '',
  },
}

export function detectPlatform(): Platform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown'
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform?.toLowerCase() || ''

  // Check for Windows
  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows'
  }

  // Check for macOS
  if (
    platform.includes('mac') ||
    userAgent.includes('macintosh') ||
    userAgent.includes('mac os')
  ) {
    return 'macos'
  }

  // Check for Linux
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux'
  }

  return 'unknown'
}

export function getPlatformInfo(platform: Platform): PlatformInfo {
  return PLATFORM_INFO[platform] || PLATFORM_INFO.unknown
}

export function getDownloadablePlatforms(): Platform[] {
  return ['windows', 'macos', 'linux']
}
