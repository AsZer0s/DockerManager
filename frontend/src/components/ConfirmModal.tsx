import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../hooks/useApp';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  isDestructive = false,
}) => {
  const { t } = useApp();
  const finalConfirmText = confirmText || t('confirm');
  const finalCancelText = cancelText || t('cancel');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <AlertTriangle className={`w-6 h-6 ${isDestructive ? 'text-rose-500' : 'text-amber-500'} shrink-0`} />
            <p className="text-zinc-600 dark:text-zinc-300 text-sm">{message}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium shadow-sm"
            >
              {finalCancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg ${isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20 text-zinc-950'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20 text-zinc-950'
                }`}
            >
              {finalConfirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;