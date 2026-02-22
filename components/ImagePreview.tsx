'use client';

import { useState } from 'react';
import { XMarkIcon, CheckIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';

interface ImagePreviewProps {
  imageUrl: string;
  fileName: string;
  onSave: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  uploadProgress?: number;
  error?: string;
}

export default function ImagePreview({
  imageUrl,
  fileName,
  onSave,
  onCancel,
  isLoading = false,
  uploadProgress = 0,
  error = '',
}: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-zinc-900">
            Vista previa de imagen
          </h3>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Image Preview */}
        <div className="p-6">
          <div className="flex justify-center overflow-hidden rounded-lg bg-zinc-100">
            <div className="relative flex h-96 w-full items-center justify-center">
              <img
                src={imageUrl}
                alt="Vista previa"
                className="max-h-full max-w-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.5 || isLoading}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Alejar"
              title="Alejar"
            >
              <ArrowsPointingInIcon className="h-5 w-5" />
            </button>
            <span className="min-w-[60px] text-center text-sm text-zinc-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 2 || isLoading}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Acercar"
              title="Acercar"
            >
              <ArrowsPointingOutIcon className="h-5 w-5" />
            </button>
            {zoom !== 1 && (
              <button
                onClick={handleResetZoom}
                disabled={isLoading}
                className="ml-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Restablecer
              </button>
            )}
          </div>

          {/* File Info */}
          <div className="mt-4 rounded-lg bg-zinc-50 px-4 py-3">
            <p className="text-sm text-zinc-600">
              <span className="font-medium">Archivo:</span> {fileName}
            </p>
          </div>

          {/* Upload Progress Bar */}
          {isLoading && uploadProgress > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Subiendo imagen...</span>
                <span className="font-medium text-zinc-900">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={isLoading}
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                Guardando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <CheckIcon className="h-5 w-5" />
                Guardar
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
