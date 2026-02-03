import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { LogoWithBackground } from '@/components/brand'
import { Loader2, CheckCircle2, Download, ArrowLeft } from 'lucide-react'
import type { RegisterData } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface LocationState {
  registerData?: RegisterData
  fromRegistration?: boolean
  fromOAuth?: boolean
  isNewUser?: boolean
}

export function TermsOfServicePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { register: registerUser, isLoading } = useAuthStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const state = location.state as LocationState | null
  const registerData = state?.registerData
  const fromRegistration = state?.fromRegistration
  const fromOAuth = state?.fromOAuth

  const isStandaloneView = !fromRegistration && !fromOAuth && location.pathname === '/terms'

  const [numPages, setNumPages] = useState<number>(0)
  const [isAgreed, setIsAgreed] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(600)

  useEffect(() => {
    if (fromRegistration && !registerData) {
      navigate('/register', { replace: true })
    }
  }, [fromRegistration, registerData, navigate])

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth
        setContainerWidth(Math.min(width - 64, 680))
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPdfLoading(false)
    setPdfError(null)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error)
    setPdfError('Unable to load the document.')
    setPdfLoading(false)
  }, [])

  const handleAgreeAndContinue = async () => {
    if (!isAgreed) {
      toast.error('Please agree to the Terms of Service')
      return
    }

    setRegistrationError(null)

    if (fromRegistration && registerData) {
      try {
        const result = await registerUser(registerData)
        if (result.success) {
          setShowSuccess(true)
        } else {
          const storeError = useAuthStore.getState().error
          if (storeError?.toLowerCase().includes('network') || storeError?.toLowerCase().includes('fetch')) {
            setRegistrationError('Unable to connect to the server. Please check your connection.')
          } else {
            setRegistrationError(storeError || 'Registration failed. Please try again.')
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        setRegistrationError(message)
      }
      return
    }

    if (fromOAuth) {
      toast.success('Terms accepted')
      navigate('/dashboard', { replace: true })
      return
    }

    toast.success('Terms acknowledged')
    navigate(-1)
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = '/legal/terms-of-service.pdf'
    link.download = 'Blockd_Terms_of_Service.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (fromRegistration && !registerData) return null

  // Success state
  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#01101B] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-semibold text-[#F3F6FB] mb-2">Account Created</h1>
            <p className="text-[#687193]">Welcome to Blockd. Your account is ready.</p>
          </div>

          <div className="bg-[#0a1929] border border-white/10 rounded-lg p-6 mb-6">
            <h2 className="text-sm font-medium text-[#F3F6FB] mb-4">Next Steps</h2>
            <ul className="space-y-3 text-sm text-[#687193]">
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#687193]" />
                Verify your email address
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#687193]" />
                Complete your profile
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#687193]" />
                Create your first session
              </li>
            </ul>
          </div>

          <Button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-[#F3F6FB] text-[#01101B] hover:bg-[#F3F6FB]/90 font-medium"
          >
            Continue to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#01101B] text-[#F3F6FB]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#01101B]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {!isStandaloneView && (
              <button
                onClick={() => navigate(fromRegistration ? '/register' : -1)}
                className="flex items-center gap-2 text-sm text-[#687193] hover:text-[#F3F6FB] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <Link to="/">
              <LogoWithBackground size="sm" showText variant="primary" />
            </Link>
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 text-sm text-[#687193] hover:text-[#F3F6FB] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight mb-3">Terms of Service</h1>
          <p className="text-[#687193] max-w-lg mx-auto">
            {isStandaloneView
              ? 'Review the Blockd Terms of Service.'
              : 'Please review and accept to continue.'}
          </p>
        </div>

        {/* Document Container */}
        <div
          ref={containerRef}
          className="bg-[#0a1929] border border-white/10 rounded-lg overflow-hidden mb-8"
        >
          {/* PDF Scroll Area */}
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="p-8 flex flex-col items-center gap-6">
              {pdfLoading && (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-[#687193] mb-4" />
                  <span className="text-sm text-[#687193]">Loading document...</span>
                </div>
              )}

              {pdfError && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-[#687193] mb-4">{pdfError}</p>
                  <button
                    onClick={() => {
                      setPdfLoading(true)
                      setPdfError(null)
                    }}
                    className="text-sm text-[#F3F6FB] underline underline-offset-4 hover:no-underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              <Document
                file="/legal/terms-of-service.pdf"
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading=""
                className={pdfLoading || pdfError ? 'hidden' : 'space-y-6'}
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    width={containerWidth}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-lg rounded overflow-hidden"
                    loading={
                      <div
                        className="flex items-center justify-center bg-white rounded"
                        style={{ width: containerWidth, height: containerWidth * 1.4 }}
                      >
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                      </div>
                    }
                  />
                ))}
              </Document>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {registrationError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{registrationError}</p>
          </div>
        )}

        {/* Agreement Section */}
        {!isStandaloneView && (
          <div className="bg-[#0a1929] border border-white/10 rounded-lg p-6">
            <label className="flex items-start gap-4 cursor-pointer group">
              <Checkbox
                checked={isAgreed}
                onCheckedChange={(checked) => setIsAgreed(checked as boolean)}
                disabled={isLoading}
                className="mt-0.5 border-white/20 data-[state=checked]:bg-[#F3F6FB] data-[state=checked]:border-[#F3F6FB]"
              />
              <span className="text-sm text-[#687193] leading-relaxed group-hover:text-[#F3F6FB]/80 transition-colors">
                I have read and agree to the{' '}
                <span className="text-[#F3F6FB]">Blockd Terms of Service</span>. I understand that
                interview sessions may be monitored for security purposes.
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => navigate(fromRegistration ? '/register' : -1)}
                disabled={isLoading}
                className="flex-1 border-white/10 text-[#687193] hover:text-[#F3F6FB] hover:bg-white/5 hover:border-white/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAgreeAndContinue}
                disabled={!isAgreed || isLoading}
                className="flex-1 bg-[#F3F6FB] text-[#01101B] hover:bg-[#F3F6FB]/90 font-medium disabled:opacity-40"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : fromRegistration ? (
                  'Agree & Create Account'
                ) : (
                  'Accept & Continue'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Standalone back button */}
        {isStandaloneView && (
          <div className="flex justify-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm text-[#687193] hover:text-[#F3F6FB] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs text-[#687193]">
            &copy; {new Date().getFullYear()} Blockd, Inc. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
