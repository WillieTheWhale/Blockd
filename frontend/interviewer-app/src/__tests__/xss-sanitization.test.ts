import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  stripHtml,
  sanitizeUrl,
  sanitizedString,
} from '../lib/validations'

describe('XSS Sanitization Utilities', () => {
  describe('escapeHtml', () => {
    it('escapes basic HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
      expect(escapeHtml('&')).toBe('&amp;')
      expect(escapeHtml('"')).toBe('&quot;')
      expect(escapeHtml("'")).toBe('&#x27;')
    })

    it('escapes a complete XSS attack vector', () => {
      const malicious = '<script>alert("xss")</script>'
      const escaped = escapeHtml(malicious)
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;')
      expect(escaped).not.toContain('<script>')
    })

    it('escapes event handler injection attempts', () => {
      const malicious = '<img src=x onerror="alert(1)">'
      const escaped = escapeHtml(malicious)
      // escapeHtml replaces < and > so the HTML tag won't be parsed
      expect(escaped).not.toContain('<img')
      expect(escaped).not.toContain('<')
      expect(escaped).not.toContain('>')
      expect(escaped).toContain('&lt;img')
    })

    it('escapes SVG-based XSS', () => {
      const malicious = '<svg onload="alert(1)">'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<svg')
    })

    it('escapes backticks used in template literals', () => {
      const malicious = '`${alert(1)}`'
      const escaped = escapeHtml(malicious)
      expect(escaped).toBe('&#x60;${alert(1)}&#x60;')
    })

    it('escapes equals signs to prevent attribute injection', () => {
      const malicious = 'data=javascript:alert(1)'
      const escaped = escapeHtml(malicious)
      expect(escaped).toBe('data&#x3D;javascript:alert(1)')
    })

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('handles non-string input gracefully', () => {
      expect(escapeHtml(null as unknown as string)).toBe('')
      expect(escapeHtml(undefined as unknown as string)).toBe('')
      expect(escapeHtml(123 as unknown as string)).toBe('')
    })

    it('preserves safe content', () => {
      expect(escapeHtml('Hello, World!')).toBe('Hello, World!')
      expect(escapeHtml('Price: $100')).toBe('Price: $100')
    })
  })

  describe('stripHtml', () => {
    it('removes basic HTML tags', () => {
      expect(stripHtml('<b>bold</b>')).toBe('bold')
      expect(stripHtml('<i>italic</i>')).toBe('italic')
    })

    it('removes script tags and content', () => {
      expect(stripHtml('<script>alert(1)</script>Hello')).toBe('alert(1)Hello')
    })

    it('removes nested tags', () => {
      expect(stripHtml('<div><span>text</span></div>')).toBe('text')
    })

    it('removes self-closing tags', () => {
      expect(stripHtml('Hello<br/>World')).toBe('HelloWorld')
      expect(stripHtml('Hello<br>World')).toBe('HelloWorld')
    })

    it('removes tags with attributes', () => {
      expect(stripHtml('<a href="http://evil.com">link</a>')).toBe('link')
      expect(stripHtml('<img src="x" onerror="alert(1)">')).toBe('')
    })

    it('handles empty string', () => {
      expect(stripHtml('')).toBe('')
    })

    it('handles non-string input gracefully', () => {
      expect(stripHtml(null as unknown as string)).toBe('')
      expect(stripHtml(undefined as unknown as string)).toBe('')
    })

    it('preserves text without HTML', () => {
      expect(stripHtml('Plain text content')).toBe('Plain text content')
    })
  })

  describe('sanitizeUrl', () => {
    it('blocks javascript: protocol', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBeNull()
      expect(sanitizeUrl('  javascript:alert(1)  ')).toBeNull()
    })

    it('blocks data: protocol', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    })

    it('blocks vbscript: protocol', () => {
      expect(sanitizeUrl('vbscript:msgbox("xss")')).toBeNull()
    })

    it('blocks file: protocol', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBeNull()
    })

    it('allows https: protocol', () => {
      const url = 'https://example.com'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('allows http: protocol', () => {
      const url = 'http://example.com'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('allows mailto: protocol', () => {
      const url = 'mailto:test@example.com'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('allows tel: protocol', () => {
      const url = 'tel:+1234567890'
      expect(sanitizeUrl(url)).toBe(url)
    })

    it('allows relative URLs starting with /', () => {
      expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page')
    })

    it('allows relative URLs without protocol', () => {
      expect(sanitizeUrl('path/to/page')).toBe('path/to/page')
      expect(sanitizeUrl('page.html')).toBe('page.html')
    })

    it('handles empty string', () => {
      expect(sanitizeUrl('')).toBe('')
    })

    it('handles non-string input gracefully', () => {
      expect(sanitizeUrl(null as unknown as string)).toBeNull()
      expect(sanitizeUrl(undefined as unknown as string)).toBeNull()
    })

    it('rejects unknown protocols', () => {
      expect(sanitizeUrl('custom:something')).toBeNull()
      expect(sanitizeUrl('ftp://example.com')).toBeNull()
    })
  })

  describe('sanitizedString', () => {
    it('escapes HTML and trims whitespace', () => {
      expect(sanitizedString('  <script>alert(1)</script>  ')).toBe(
        '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'
      )
    })

    it('preserves normal text with trimming', () => {
      expect(sanitizedString('  Hello World  ')).toBe('Hello World')
    })

    it('handles user input with special characters', () => {
      const input = "  John's <b>name</b>  "
      const result = sanitizedString(input)
      expect(result).toBe("John&#x27;s &lt;b&gt;name&lt;&#x2F;b&gt;")
    })
  })

  describe('Real-world XSS attack vectors', () => {
    it('prevents DOM-based XSS via innerHTML equivalent', () => {
      const attacks = [
        '<img src=x onerror=alert(1)>',
        '<svg/onload=alert(1)>',
        '<body onload=alert(1)>',
        '<iframe src="javascript:alert(1)">',
        '<input onfocus=alert(1) autofocus>',
      ]

      for (const attack of attacks) {
        const escaped = escapeHtml(attack)
        expect(escaped).not.toContain('<')
        expect(escaped).not.toContain('>')
      }
    })

    it('prevents attribute injection', () => {
      const attacks = [
        '" onclick="alert(1)',
        "' onclick='alert(1)",
        '"><script>alert(1)</script>',
      ]

      for (const attack of attacks) {
        const escaped = escapeHtml(attack)
        expect(escaped).not.toContain('"')
        expect(escaped).not.toContain("'")
      }
    })

    it('prevents URL-based attacks', () => {
      const attacks = [
        'javascript:alert(document.cookie)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript:msgbox(document.domain)',
      ]

      for (const attack of attacks) {
        expect(sanitizeUrl(attack)).toBeNull()
      }
    })
  })
})
