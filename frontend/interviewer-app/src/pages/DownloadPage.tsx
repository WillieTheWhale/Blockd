import { Download } from '@/components/landing/Download'

export function DownloadPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Download showTitle={true} className="flex-1" />
    </div>
  )
}
