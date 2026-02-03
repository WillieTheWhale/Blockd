import { Twitter, Linkedin, Github } from 'lucide-react';
import { FOOTER_LINKS, SITE_CONFIG } from '@/lib/constants';
import { Container } from './container';
import { LogoWithBackground } from '@/components/brand';

// Footer Component

const socialIcons = {
  twitter: Twitter,
  linkedin: Linkedin,
  github: Github,
};

function FooterLogo() {
  return <LogoWithBackground size="sm" showText variant="primary" />;
}

interface FooterLinkGroupProps {
  title: string;
  links: readonly { readonly label: string; readonly href: string }[];
}

function FooterLinkGroupStatic({ title, links }: FooterLinkGroupProps) {
  return (
    <div>
      <h3 className="font-display font-semibold mb-4 text-blockd-light">
        {title}
      </h3>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-blockd-muted hover:text-blockd-light transition-colors duration-200 text-sm"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10">
      <Container>
        <div className="py-16 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <FooterLogo />
              <p className="mt-4 text-sm max-w-xs text-blockd-muted">
                {SITE_CONFIG.tagline}
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-4 mt-6">
                {[
                  { icon: 'twitter', href: '#', label: 'Follow us on Twitter' },
                  { icon: 'linkedin', href: '#', label: 'Connect on LinkedIn' },
                  { icon: 'github', href: '#', label: 'View our GitHub' },
                ].map((social) => {
                  const Icon = socialIcons[social.icon as keyof typeof socialIcons];
                  return (
                    <a
                      key={social.icon}
                      href={social.href}
                      className="p-2 text-blockd-muted hover:text-blockd-accent transition-colors duration-200"
                      aria-label={social.label}
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Link Columns */}
            <FooterLinkGroupStatic title="Product" links={FOOTER_LINKS.product} />
            <FooterLinkGroupStatic title="Resources" links={FOOTER_LINKS.resources} />
            <FooterLinkGroupStatic title="Company" links={FOOTER_LINKS.company} />
          </div>

          {/* Bottom Bar */}
          <div className="mt-16 pt-8 border-t border-blockd-muted/10 text-center md:text-left">
            <p className="text-sm text-blockd-muted">
              &copy; {new Date().getFullYear()} Blockd. All rights reserved.
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
