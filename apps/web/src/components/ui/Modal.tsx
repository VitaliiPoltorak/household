import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Portaled to <body> (#227) — a modal opened from within another modal's
  // <form> (e.g. AddAccountTypeModal from AccountTypeField) would otherwise
  // render its own <form> as an HTML-invalid descendant of the outer one;
  // browsers collapse nested forms, which can misroute submit events. The
  // dark-mode class lives on <html>, so styling still applies at any depth.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-4 text-gray-800 dark:text-gray-200">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
