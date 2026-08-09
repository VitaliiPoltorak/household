import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

/** Dashboard-style section with an uppercase title above content. */
export function Section({ title, children }: Props) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}
