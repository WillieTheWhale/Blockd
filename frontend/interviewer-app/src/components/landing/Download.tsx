import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download as DownloadIcon, CheckCircle, Shield } from 'lucide-react'
import {
  detectPlatform,
  getPlatformInfo,
  getDownloadablePlatforms,
  Platform,
  PlatformInfo,
  CURRENT_VERSION,
} from '@/lib/platform-detection'

// Platform icons as SVG components
function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.311.004-.466.013-.963.035-1.878.29-2.734.736-1.008.525-1.873 1.32-2.583 2.37-.612.905-1.085 1.97-1.406 3.157-.168.623-.284 1.273-.348 1.941-.063.668-.075 1.352-.034 2.048.06 1.042.23 2.112.507 3.196.303 1.184.733 2.394 1.297 3.616.396.86.873 1.728 1.442 2.596.35.534.748 1.062 1.199 1.58.368.423.78.832 1.237 1.22.503.427 1.063.823 1.679 1.18.56.324 1.172.608 1.835.84.576.203 1.185.354 1.82.448.48.072.972.107 1.47.105.507-.003 1.02-.04 1.532-.113.49-.07.975-.174 1.453-.314.46-.135.907-.304 1.341-.508.455-.213.89-.462 1.305-.745.415-.284.807-.602 1.176-.952.386-.367.743-.767 1.069-1.196.352-.463.665-.96.938-1.488.25-.483.464-.992.64-1.525.177-.537.314-1.095.41-1.672.085-.512.134-1.039.146-1.578.013-.53-.009-1.074-.064-1.627-.057-.565-.148-1.14-.275-1.722-.14-.642-.328-1.295-.564-1.956-.265-.743-.594-1.5-.989-2.263-.43-.83-.933-1.668-1.513-2.508-.577-.837-1.231-1.674-1.964-2.505-.753-.853-1.59-1.698-2.51-2.531-.817-.739-1.707-1.469-2.672-2.188C15.01.857 13.78.194 12.504 0zm.052 1.413c.843.023 1.64.275 2.394.735.817.498 1.578 1.184 2.277 2.053.611.758 1.146 1.603 1.605 2.524.436.875.794 1.811 1.075 2.797.285 1.003.49 2.052.61 3.136.098.887.132 1.786.096 2.686-.032.8-.121 1.598-.27 2.39-.143.765-.345 1.521-.605 2.262-.257.732-.573 1.448-.947 2.143-.365.678-.788 1.333-1.27 1.959-.469.608-1.001 1.188-1.6 1.734-.547.499-1.154.962-1.822 1.383-.604.38-1.261.715-1.967.998-.612.244-1.261.437-1.942.573-.573.114-1.172.178-1.79.189-.516.009-1.05-.023-1.594-.098-.492-.068-1-.177-1.52-.329-.477-.14-.964-.322-1.458-.548-.465-.212-.937-.468-1.414-.768-.433-.273-.869-.588-1.306-.945-.393-.322-.786-.682-1.175-1.082-.387-.4-.768-.84-1.14-1.322-.383-.497-.752-1.033-1.103-1.607-.384-.629-.744-1.293-1.074-1.991-.378-.798-.712-1.624-.999-2.475-.32-.95-.575-1.922-.763-2.91-.146-.762-.247-1.534-.302-2.31-.051-.724-.061-1.45-.028-2.173.035-.766.118-1.529.252-2.285.14-.786.337-1.563.59-2.324.278-.839.632-1.656 1.063-2.444.477-.872 1.05-1.706 1.723-2.493.74-.864 1.601-1.679 2.581-2.434.885-.682 1.867-1.304 2.938-1.858.879-.454 1.82-.838 2.819-1.141.764-.232 1.561-.403 2.385-.508.495-.063 1-.092 1.513-.087z" />
    </svg>
  )
}

function PlatformIcon({ icon, className }: { icon: 'windows' | 'apple' | 'linux'; className?: string }) {
  switch (icon) {
    case 'windows':
      return <WindowsIcon className={className} />
    case 'apple':
      return <AppleIcon className={className} />
    case 'linux':
      return <LinuxIcon className={className} />
    default:
      return null
  }
}

interface DownloadCardProps {
  info: PlatformInfo
  isDetected: boolean
}

function DownloadCard({ info, isDetected }: DownloadCardProps) {
  return (
    <div
      className={`relative flex flex-col items-center p-6 rounded-2xl border transition-all ${
        isDetected
          ? 'border-primary bg-primary/5 shadow-lg scale-105'
          : 'border-border/40 bg-card/50 hover:border-primary/50 hover:bg-primary/5'
      }`}
    >
      {isDetected && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
          <CheckCircle className="h-3 w-3 mr-1" />
          Recommended
        </Badge>
      )}

      <PlatformIcon icon={info.icon} className="h-12 w-12 mb-4 text-foreground" />

      <h3 className="text-lg font-semibold mb-1">{info.displayName}</h3>
      <p className="text-sm text-muted-foreground mb-4">{info.fileSize}</p>

      <Button
        size="lg"
        className="w-full"
        variant={isDetected ? 'default' : 'outline'}
        asChild
      >
        <a
          href={info.downloadUrl}
          download={info.fileName}
          aria-label={`Download Blockd Browser for ${info.displayName} (${info.fileSize})`}
        >
          <DownloadIcon className="h-4 w-4 mr-2" />
          Download
        </a>
      </Button>
    </div>
  )
}

interface DownloadProps {
  showTitle?: boolean
  className?: string
}

export function Download({ showTitle = true, className = '' }: DownloadProps) {
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>('unknown')

  useEffect(() => {
    setDetectedPlatform(detectPlatform())
  }, [])

  const platforms = getDownloadablePlatforms()

  // Sort platforms so detected one comes first
  const sortedPlatforms = [...platforms].sort((a, b) => {
    if (a === detectedPlatform) return -1
    if (b === detectedPlatform) return 1
    return 0
  })

  return (
    <section id="download" className={`py-20 ${className}`}>
      <div className="container mx-auto px-4 md:px-6">
        {showTitle && (
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">
              <Shield className="h-3 w-3 mr-1" />
              Secure Browser
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Download Blockd Browser
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The secure browser for interviewees. Built-in security monitoring,
              eye tracking, and AI detection integration.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {sortedPlatforms.map((platform) => (
            <DownloadCard
              key={platform}
              info={getPlatformInfo(platform)}
              isDetected={platform === detectedPlatform}
            />
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Version {CURRENT_VERSION} &bull; Requires Windows 10+, macOS 11+, or Linux (Ubuntu 20.04+)
          </p>
        </div>
      </div>
    </section>
  )
}
