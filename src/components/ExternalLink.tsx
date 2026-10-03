import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';
import { safeExternalUrl } from '../lib/url';

type ExternalLinkProps = PropsWithChildren<
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
    href?: string;
  }
>;

export function ExternalLink({ href, children, ...props }: ExternalLinkProps) {
  const safeHref = safeExternalUrl(href);
  if (!safeHref) return null;

  return (
    <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
