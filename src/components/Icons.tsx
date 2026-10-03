import type { SVGProps } from 'react';

export type IconName =
  | 'search'
  | 'library'
  | 'workspace'
  | 'network'
  | 'sun'
  | 'moon'
  | 'bookmark'
  | 'external'
  | 'file'
  | 'close'
  | 'plus'
  | 'arrow'
  | 'filter'
  | 'check';

const paths: Record<IconName, string[]> = {
  search: ['M21 21l-4.3-4.3', 'M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z'],
  library: ['M4 4v16', 'M8 5v14', 'M12 4v16', 'M16 6l4-1v14l-4 1Z'],
  workspace: ['M4 6h6l2 2h8v11H4Z', 'M4 10h16'],
  network: ['M12 5v4', 'M6 19v-4h12v4', 'M6 15v-3h12v3', 'M12 12V9', 'M9 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z'],
  sun: ['M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'm5.6-6.4-1.4-1.4', 'm15.6 15.6-1.4-1.4', 'm18.4 5.6 1.4-1.4', 'm4.2 19.8 1.4-1.4', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  moon: ['M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z'],
  bookmark: ['M6 3h12v18l-6-4-6 4Z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 13v6H5V5h6'],
  file: ['M6 2h8l4 4v16H6Z', 'M14 2v5h5'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  arrow: ['M5 12h14', 'm14 6 6 6-6 6'],
  filter: ['M4 5h16', 'M7 12h10', 'M10 19h4'],
  check: ['m5 12 4 4L19 6'],
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name].map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}
