'use client';

import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/auth-context';
import { profileApi, ApiError } from '@/lib/api-client';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import ImagePreview from '@/components/ImagePreview';
import AccountCard from '@/components/account/AccountCard';
import {
  PhotoIcon,
  XMarkIcon,
  InformationCircleIcon,
  CalendarIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface ProfileData {
  userId: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  profileImage: string | null;
  profileImageUrl: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

export default function AccountProfilePage() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  const [nombreError, setNombreError] = useState('');
  const [apellidoError, setApellidoError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showUserId, setShowUserId] = useState(false);
  const [userIdCopied, setUserIdCopied] = useState(false);

  const { markDirty, markClean } = useDirtyFormGuard();

  // Derived dirty state
  const isDirty =
    nombre !== (profile?.nombre || '') || apellido !== (profile?.apellido || '');

  useEffect(() => {
    if (isDirty) {
      markDirty();
    } else {
      markClean();
    }
  }, [isDirty, markDirty, markClean]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await profileApi.getProfile();
      setProfile(data);
      setNombre(data.nombre || '');
      setApellido(data.apellido || '');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al cargar el perfil');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNombre(profile?.nombre || '');
    setApellido(profile?.apellido || '');
    setSelectedFile(null);
    setImagePreview(null);
    setShowImagePreview(false);
    setNombreError('');
    setApellidoError('');
    setError('');
    setSuccess('');
    markClean();
  };

  const handleImagePreviewSave = async () => {
    if (!selectedFile) return;

    try {
      setIsUploadingImage(true);
      setError('');
      await uploadProfileImage(selectedFile);
      setSuccess('Imagen de perfil actualizada correctamente');
      setShowImagePreview(false);
      setSelectedFile(null);
      setImagePreview(null);
      await loadProfile();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al guardar la imagen de perfil');
      }
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  };

  const handleImagePreviewCancel = () => {
    setShowImagePreview(false);
    setSelectedFile(null);
    setImagePreview(null);
  };

  const handleToggleUserId = () => setShowUserId((v) => !v);

  const handleCopyUserId = async () => {
    if (!user?.userId) return;
    try {
      await navigator.clipboard.writeText(user.userId);
      setUserIdCopied(true);
      setTimeout(() => setUserIdCopied(false), 2000);
    } catch {
      setError('Error al copiar el ID de usuario');
    }
  };

  const validate = (): boolean => {
    let valid = true;
    if (nombre.trim().length < 2) {
      setNombreError('El nombre debe tener al menos 2 caracteres');
      valid = false;
    } else {
      setNombreError('');
    }
    if (apellido.trim().length < 2) {
      setApellidoError('El apellido debe tener al menos 2 caracteres');
      valid = false;
    } else {
      setApellidoError('');
    }
    return valid;
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (!validate()) return;

    try {
      setIsSaving(true);
      await profileApi.updateProfile({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
      });
      setSuccess('Perfil actualizado correctamente');
      markClean();
      await loadProfile();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al guardar el perfil');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleImageSelect = (acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const code = rejectedFiles[0]?.errors?.[0]?.code;
      if (code === 'file-too-large') {
        setError('La imagen no debe superar 2MB');
      } else if (code === 'file-invalid-type') {
        setError('Solo se permiten imágenes JPEG o PNG');
      } else {
        setError('Error al seleccionar la imagen');
      }
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setShowImagePreview(true);
    };
    reader.readAsDataURL(file);
    setError('');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleImageSelect,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: 2 * 1024 * 1024,
    multiple: false,
  });

  const uploadProfileImage = async (file: File) => {
    try {
      setIsUploadingImage(true);
      setUploadProgress(0);

      let presignedUrl: string;
      try {
        const response = await profileApi.getImageUploadUrl(
          `${Date.now()}-${file.name}`,
          file.type
        );
        presignedUrl = response.presignedUrl;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.statusCode === 401) throw new Error('Tu sesión expiró. Por favor, inicia sesión nuevamente');
          if (err.statusCode === 400) throw new Error('Formato de archivo no válido. Solo se permiten imágenes JPEG, PNG o WebP');
          if (err.statusCode === 403) throw new Error('No tienes permisos para subir imágenes');
        }
        throw new Error('Error al obtener URL de subida. Por favor, intenta nuevamente');
      }

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
            reject(new Error('La imagen es demasiado grande. El tamaño máximo es 2MB'));
          } else {
            reject(new Error(`Error al subir la imagen (código ${xhr.status})`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Error de red al subir la imagen. Verifica tu conexión a internet')));
        xhr.addEventListener('abort', () => reject(new Error('Subida cancelada')));
        xhr.addEventListener('timeout', () => reject(new Error('La subida tardó demasiado. Por favor, intenta nuevamente')));
        xhr.timeout = 30000;
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    } catch (err) {
      setUploadProgress(0);
      throw err;
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-lg text-red-600">Error al cargar el perfil</div>
      </div>
    );
  }

  return (
    <>
      {/* Profile Photo Section */}
      <AccountCard title="Foto de perfil">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-zinc-200">
            {imagePreview || profile.profileImageUrl ? (
              <img
                src={imagePreview || profile.profileImageUrl || ''}
                alt="Foto de perfil"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-zinc-400">
                {nombre.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>

          {/* Dropzone */}
          <div className="flex-1">
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm font-medium transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex items-center justify-center gap-2">
                <PhotoIcon className="h-5 w-5" />
                <span>{isDragActive ? 'Suelta aquí' : selectedFile ? 'Cambiar foto' : 'Seleccionar foto'}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">JPG o PNG, máx. 2MB</p>
            </div>

            {selectedFile && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs">
                <span className="truncate text-blue-700">{selectedFile.name}</span>
                <button
                  onClick={() => { setSelectedFile(null); setImagePreview(null); }}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                  aria-label="Eliminar imagen seleccionada"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </AccountCard>

      {/* Personal Information */}
      <AccountCard title="Información Personal">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">{success}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-3 text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
            />
            {nombreError && (
              <p className="mt-1 text-xs text-red-600">{nombreError}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Apellido</label>
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
            />
            {apellidoError && (
              <p className="mt-1 text-xs text-red-600">{apellidoError}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving || isUploadingImage}
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            style={{ minHeight: '44px' }}
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
          {isDirty && (
            <button
              onClick={handleCancel}
              disabled={isSaving || isUploadingImage}
              className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
              style={{ minHeight: '44px' }}
            >
              Descartar cambios
            </button>
          )}
        </div>
      </AccountCard>

      {/* Account Information */}
      <AccountCard title="Información de Cuenta">
        <div className="flex items-center gap-3 -mt-3 mb-4">
          <InformationCircleIcon className="h-5 w-5 text-blue-600" />
          <span className="text-sm text-zinc-500">Datos de tu cuenta</span>
        </div>

        <div className="space-y-0">
          {/* Email verified */}
          <div className="flex items-center justify-between py-3 border-b border-zinc-200">
            <span className="text-sm font-medium text-zinc-700">Email verificado</span>
            {user?.emailVerified ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                <svg className="mr-1.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Sí
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                <svg className="mr-1.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                No
              </span>
            )}
          </div>

          {/* Registration date */}
          <div className="flex items-center justify-between py-3 border-b border-zinc-200">
            <span className="text-sm font-medium text-zinc-700">Fecha de registro</span>
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <CalendarIcon className="h-4 w-4" />
              {profile.createdAt ? (
                <span>{format(new Date(profile.createdAt), 'd MMM yyyy', { locale: es })}</span>
              ) : (
                <span className="italic text-zinc-400">No disponible</span>
              )}
            </div>
          </div>

          {/* Last login */}
          {profile.lastLoginAt && (
            <div className="flex items-center justify-between py-3 border-b border-zinc-200">
              <span className="text-sm font-medium text-zinc-700">Último inicio de sesión</span>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <CalendarIcon className="h-4 w-4" />
                <span>
                  {formatDistanceToNow(new Date(profile.lastLoginAt), { addSuffix: true, locale: es })}
                </span>
              </div>
            </div>
          )}

          {/* User ID */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-zinc-700">ID de usuario</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-zinc-600">
                {showUserId ? user?.userId : '••••••••••••••••'}
              </span>
              <button
                onClick={handleToggleUserId}
                className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                aria-label={showUserId ? 'Ocultar ID de usuario' : 'Mostrar ID de usuario'}
              >
                {showUserId ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
              <button
                onClick={handleCopyUserId}
                className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                aria-label="Copiar ID de usuario"
              >
                {userIdCopied ? <CheckIcon className="h-4 w-4 text-green-600" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </AccountCard>

      {/* Image Preview Modal */}
      {showImagePreview && imagePreview && selectedFile && (
        <ImagePreview
          imageUrl={imagePreview}
          fileName={selectedFile.name}
          onSave={handleImagePreviewSave}
          onCancel={handleImagePreviewCancel}
          isLoading={isUploadingImage}
          uploadProgress={uploadProgress}
          error={error}
        />
      )}
    </>
  );
}
