'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeftIcon,
  DocumentArrowUpIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { policiesApi, ApiError } from '@/lib/api/policiesApi';

type UploadState = 'idle' | 'uploading' | 'ingesting' | 'error';

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export default function NuevaPolicyPage() {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [fileError, setFileError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDrop = (acceptedFiles: File[], rejectedFiles: any[]) => {
    setFileError('');
    setErrorMessage('');

    if (rejectedFiles.length > 0) {
      const code = rejectedFiles[0]?.errors?.[0]?.code;
      if (code === 'file-too-large') {
        setFileError('El archivo no debe superar 20MB');
      } else if (code === 'file-invalid-type') {
        setFileError('Solo se permiten archivos PDF, PNG o JPG');
      } else {
        setFileError('Error al seleccionar el archivo');
      }
      return;
    }

    if (acceptedFiles[0]) {
      setSelectedFile(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    let policyId: string;
    let presignedPutUrl: string;
    try {
      const response = await policiesApi.getUploadUrl({
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        fileSizeBytes: selectedFile.size,
      });
      policyId = response.policyId;
      presignedPutUrl = response.presignedPutUrl;
    } catch (err) {
      let msg = 'Error al obtener URL de subida. Por favor, intenta nuevamente';
      if (err instanceof ApiError) {
        if (err.statusCode === 401) msg = 'Tu sesión expiró. Por favor, inicia sesión nuevamente';
        else if (err.statusCode === 403) msg = 'No tienes permisos para subir documentos';
        else msg = err.message;
      }
      setErrorMessage(msg);
      setUploadState('error');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else if (xhr.status === 403) {
            reject(new Error('Acceso denegado. La URL de subida expiró o no es válida'));
          } else if (xhr.status === 413) {
            reject(new Error('El archivo es demasiado grande. El tamaño máximo es 20MB'));
          } else {
            reject(new Error(`Error al subir el archivo (código ${xhr.status})`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Error de red al subir el archivo. Verifica tu conexión a internet')));
        xhr.addEventListener('abort', () => reject(new Error('Subida cancelada')));
        xhr.addEventListener('timeout', () => reject(new Error('La subida tardó demasiado. Por favor, intenta nuevamente')));
        xhr.timeout = 60000;
        xhr.open('PUT', presignedPutUrl);
        xhr.setRequestHeader('Content-Type', selectedFile.type);
        xhr.send(selectedFile);
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al subir el archivo');
      setUploadState('error');
      setUploadProgress(0);
      return;
    }

    // Ingest: transition CREATED → UPLOADED + enqueue extraction
    setUploadState('ingesting');
    try {
      await policiesApi.ingest(policyId);
      router.push(`/policies/${policyId}`);
    } catch (err) {
      let msg = 'Error al iniciar el procesamiento. Por favor, intenta nuevamente';
      if (err instanceof ApiError) msg = err.message;
      setErrorMessage(msg);
      setUploadState('error');
    }
  };

  return (
    <div>
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/policies"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Mis pólizas
        </Link>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900">Subir póliza</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Sube el PDF o imagen de tu póliza. Extraeremos los datos automáticamente.
        </p>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-50 text-blue-600'
              : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100'
          }`}
        >
          <input {...getInputProps()} />
          <DocumentArrowUpIcon className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
          {isDragActive ? (
            <p className="text-sm font-medium">Suelta el archivo aquí</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {selectedFile ? selectedFile.name : 'Arrastra tu archivo o haz clic para seleccionar'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">PDF, PNG o JPG · máx. 20MB</p>
            </>
          )}
        </div>

        {/* File error */}
        {fileError && (
          <p className="mt-2 text-sm text-red-600">{fileError}</p>
        )}

        {/* Upload error */}
        {uploadState === 'error' && errorMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            <XCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Progress bar */}
        {uploadState === 'uploading' && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-zinc-500">
              <span>Subiendo...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Ingesting indicator */}
        {uploadState === 'ingesting' && (
          <div className="mt-4 text-center text-sm text-zinc-500">
            Iniciando análisis...
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploadState === 'uploading' || uploadState === 'ingesting'}
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            style={{ minHeight: '44px' }}
          >
            {uploadState === 'uploading'
              ? 'Subiendo...'
              : uploadState === 'ingesting'
              ? 'Procesando...'
              : 'Subir póliza'}
          </button>
          {selectedFile && uploadState !== 'uploading' && uploadState !== 'ingesting' && (
            <button
              onClick={() => {
                setSelectedFile(null);
                setFileError('');
                setErrorMessage('');
                setUploadState('idle');
              }}
              className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              style={{ minHeight: '44px' }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
