import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import Modal from "./Modal";

interface PdfPreviewModalProps {
  url: string;
  title: string;
  filename?: string;
  onClose: () => void;
}

export default function PdfPreviewModal({ url, title, filename, onClose }: PdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let revoked = false;
    setLoading(true);
    setError("");
    api.download(url)
      .then((blob) => {
        if (!revoked) {
          setPdfUrl(URL.createObjectURL(blob));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!revoked) {
          setError(err?.message || "Failed to load PDF");
          setLoading(false);
        }
      });
    return () => {
      revoked = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [url]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = filename || "document.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [pdfUrl, filename]);

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="5xl"
      panelClassName="flex max-h-[90vh] flex-col overflow-hidden"
      backdropClassName="bg-black/60"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[#1a1a24]">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!pdfUrl}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]"
            >
              Download
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#1a1a24] dark:hover:text-[#f1f5f9]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="min-h-[60vh] flex-1 overflow-auto">
          {loading && (
            <div className="flex h-[60vh] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-500 dark:border-[#282832] dark:border-t-blue-500" />
            </div>
          )}
          {error && (
            <div className="flex h-[60vh] items-center justify-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          {pdfUrl && !loading && (
            <iframe
              src={pdfUrl}
              className="h-[75vh] w-full border-0"
              title={title}
            />
          )}
        </div>
    </Modal>
  );
}
