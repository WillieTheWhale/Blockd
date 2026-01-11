/**
 * Base Email Template
 * Blockd Auth Service
 *
 * Professional HTML email wrapper with responsive design
 */

/**
 * Wrap email content in a professional HTML template
 */
export function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Blockd</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }

    /* Base styles */
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      background-color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #27272a;
    }

    /* Container */
    .email-wrapper {
      width: 100%;
      background-color: #f4f4f5;
      padding: 40px 20px;
    }

    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }

    /* Header */
    .email-header {
      background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
      padding: 32px 40px;
      text-align: center;
    }

    .logo {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: -0.5px;
    }

    .logo-icon {
      display: inline-block;
      width: 40px;
      height: 40px;
      background-color: #ffffff;
      border-radius: 8px;
      margin-right: 12px;
      vertical-align: middle;
      text-align: center;
      line-height: 40px;
      font-size: 20px;
      color: #0066cc;
    }

    /* Content */
    .email-content {
      padding: 40px;
    }

    h1 {
      margin: 0 0 24px 0;
      font-size: 24px;
      font-weight: 600;
      color: #18181b;
      line-height: 1.3;
    }

    p {
      margin: 0 0 16px 0;
      color: #3f3f46;
    }

    /* Button */
    .button-container {
      text-align: center;
      margin: 32px 0;
    }

    .button {
      display: inline-block;
      background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
      color: #ffffff !important;
      padding: 14px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.2s ease;
    }

    .button:hover {
      background: linear-gradient(135deg, #0052a3 0%, #003d7a 100%);
    }

    /* Code block */
    .code-block {
      background-color: #f4f4f5;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 16px 24px;
      text-align: center;
      margin: 24px 0;
    }

    .code {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', monospace;
      font-size: 20px;
      font-weight: 600;
      color: #18181b;
      letter-spacing: 2px;
    }

    /* Info box */
    .info-box {
      background-color: #eff6ff;
      border-left: 4px solid #0066cc;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }

    .info-box p {
      margin: 0;
      color: #1e40af;
      font-size: 14px;
    }

    /* Warning box */
    .warning-box {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }

    .warning-box p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }

    /* Footer */
    .email-footer {
      background-color: #fafafa;
      padding: 24px 40px;
      border-top: 1px solid #e4e4e7;
      text-align: center;
    }

    .footer-text {
      font-size: 13px;
      color: #71717a;
      margin: 0 0 8px 0;
    }

    .footer-links {
      margin-top: 16px;
    }

    .footer-links a {
      color: #71717a;
      text-decoration: none;
      font-size: 12px;
      margin: 0 12px;
    }

    .footer-links a:hover {
      color: #0066cc;
    }

    /* Utility */
    .text-muted {
      color: #71717a;
      font-size: 14px;
    }

    .text-small {
      font-size: 14px;
    }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 10px;
      }

      .email-content,
      .email-header,
      .email-footer {
        padding-left: 24px;
        padding-right: 24px;
      }

      h1 {
        font-size: 22px;
      }

      .button {
        display: block;
        padding: 16px 24px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" width="100%">
      <!-- Header -->
      <tr>
        <td class="email-header">
          <span class="logo">
            <span class="logo-icon">B</span>
            Blockd
          </span>
        </td>
      </tr>

      <!-- Content -->
      <tr>
        <td class="email-content">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td class="email-footer">
          <p class="footer-text">
            This email was sent by Blockd - AI-Powered Interview Security
          </p>
          <p class="footer-text">
            If you didn't request this email, you can safely ignore it.
          </p>
          <div class="footer-links">
            <a href="https://blockd.io/privacy">Privacy Policy</a>
            <a href="https://blockd.io/terms">Terms of Service</a>
            <a href="https://blockd.io/support">Support</a>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Validate and escape a URL for use in href attributes
 * Prevents javascript: and data: protocol injection
 */
export function escapeUrl(url: string): string {
  const escaped = escapeHtml(url);
  try {
    const parsed = new URL(escaped);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn(`[Email] Invalid URL protocol rejected: ${parsed.protocol}`);
      return '#invalid-url';
    }
    return escaped;
  } catch {
    console.warn(`[Email] Invalid URL format rejected: ${url.substring(0, 50)}`);
    return '#invalid-url';
  }
}
