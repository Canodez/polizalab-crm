'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/auth-context';
import { profileApi, ApiError } from '@/lib/api-client';
import UserMenu from '@/components/UserMenu';
import ImagePreview from '@/components/ImagePreview';
import { PhotoIcon, XMarkIcon, InformationCircleIcon, CalendarIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

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

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // User ID visibility and copy state
  const [showUserId, setShowUserId] = useState(false);
  const [userIdCopied, setUserIdCopied] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load profile data
  useEffect(() => {
    if (isAuthenticated) {
      loadProfile();
    }
  }, [isAuthenticated]);

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

  const handleEdit = () => {
    setIsEditing(true);
    setError('');
    setSuccess('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNombre(profile?.nombre || '');
    setApellido(profile?.apellido || '');
    setSelectedFile(null);
    setImagePreview(null);
    setShowImagePreview(false);
    setError('');
    setSuccess('');
  };

  const handleImagePreviewSave = async () => {
    if (!selectedFile) return;

    try {
      setIsUploadingImage(true);
      setError('');
      
      // Upload image (backend automatically saves metadata to DynamoDB)
      await uploadProfileImage(selectedFile);
      
      setSuccess('Imagen de perfil actualizada correctamente');
      setShowImagePreview(false);
      setSelectedFile(null);
      setImagePreview(null);
      
      // Reload profile to get updated image URL
      await loadProfile();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al guardar la imagen de perfil');
      }
      // Keep the preview open so user can retry
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

  const handleToggleUserId = () => {
    setShowUserId(!showUserId);
  };

  const handleCopyUserId = async () => {
    if (!user?.userId) return;
    
    try {
      await navigator.clipboard.writeText(user.userId);
      setUserIdCopied(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setUserIdCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy user ID:', err);
      setError('Error al copiar el ID de usuario');
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    // Validate fields
    if (!nombre.trim() || !apellido.trim()) {
      setError('Nombre y apellido son requeridos');
      return;
    }

    try {
      setIsSaving(true);
      
      // Upload image if selected
      if (selectedFile) {
        await uploadProfileImage(selectedFile);
      }
      
      // Update profile fields
      await profileApi.updateProfile({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
      });
      
      setSuccess('Perfil actualizado correctamente');
      setIsEditing(false);
      
      // Reload profile to get updated data
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

  const handleImageSelect = (acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files (validation errors)
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors) {
        const error = rejection.errors[0];
        if (error.code === 'file-too-large') {
          setError('La imagen no debe superar 2MB');
        } else if (error.code === 'file-invalid-type') {
          setError('Solo se permiten imágenes JPEG o PNG');
        } else {
          setError('Error al seleccionar la imagen');
        }
      }
      return;
    }

    // Handle accepted file
    const file = acceptedFiles[0];
    if (!file) return;

    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setShowImagePreview(true);
    };
    reader.readAsDataURL(file);
    
    setError('');
  };

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleImageSelect,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxSize: 2 * 1024 * 1024, // 2MB
    multiple: false,
    disabled: !isEditing
  });

  const uploadProfileImage = async (file: File) => {
    try {
      setIsUploadingImage(true);
      setUploadProgress(0);
      
      // Get pre-signed URL
      let presignedUrl: string;
      
      try {
        const response = await profileApi.getImageUploadUrl(
          file.name,
          file.type  // This is the contentType
        );
        presignedUrl = response.presignedUrl;
        // Note: s3Key is already saved in DynamoDB by the backend
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.statusCode === 401) {
            throw new Error('Tu sesión expiró. Por favor, inicia sesión nuevamente');
          } else if (err.statusCode === 400) {
            throw new Error('Formato de archivo no válido. Solo se permiten imágenes JPEG, PNG o WebP');
          } else if (err.statusCode === 403) {
            throw new Error('No tienes permisos para subir imágenes');
          }
        }
        throw new Error('Error al obtener URL de subida. Por favor, intenta nuevamente');
      }
      
      // Upload to S3 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentComplete);
          }
        });
        
        // Handle completion
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
        
        // Handle errors
        xhr.addEventListener('error', () => {
          reject(new Error('Error de red al subir la imagen. Verifica tu conexión a internet'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Subida cancelada'));
        });
        
        xhr.addEventListener('timeout', () => {
          reject(new Error('La subida tardó demasiado. Por favor, intenta nuevamente'));
        });
        
        // Set timeout (30 seconds)
        xhr.timeout = 30000;
        
        // Open and send request
        xhr.open('PUT', presignedUrl);
        // CRITICAL: Content-Type must match the one used in presigned URL generation
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    } catch (err) {
      setUploadProgress(0);
      // Re-throw the error to be handled by the caller
      throw err;
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="text-lg text-zinc-600">Cargando...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="text-lg text-red-600">Error al cargar el perfil</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header with UserMenu */}
      <div className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-zinc-900">PolizaLab CRM</h1>
          <UserMenu />
        </div>
      </div>

      {/* Main Content */}
      <div className="py-8 px-4">
        <div className="mx-auto max-w-4xl">
          {/* Profile Header Section */}
          <div className="mb-8 rounded-lg bg-white p-8 shadow-sm">
            <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:items-start gap-6">
              {/* Profile Image - 120px x 120px */}
              <div className="flex-shrink-0">
                <div className="h-[120px] w-[120px] overflow-hidden rounded-full bg-zinc-200">
                  {imagePreview || profile.profileImageUrl ? (
                    <img
                      src={imagePreview || profile.profileImageUrl || ''}
                      alt="Foto de perfil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-zinc-400">
                      {nombre.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                
                {/* Change Photo Button with Dropzone */}
                {isEditing ? (
                  <div
                    {...getRootProps()}
                    className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed px-4 py-2 text-center text-sm font-medium transition-colors ${
                      isDragActive
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="flex items-center justify-center gap-2">
                      <PhotoIcon className="h-5 w-5" />
                      <span>
                        {isDragActive ? 'Suelta aquí' : selectedFile ? 'Cambiar foto' : 'Seleccionar foto'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      JPG o PNG, máx. 2MB
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-zinc-500">
                    <div className="flex items-center justify-center gap-2">
                      <PhotoIcon className="h-5 w-5" />
                      <span>Cambiar foto</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">
                      Edita el perfil primero
                    </p>
                  </div>
                )}
                
                {/* Show selected file name */}
                {selectedFile && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs">
                    <span className="truncate text-blue-700">{selectedFile.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setImagePreview(null);
                      }}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                      aria-label="Eliminar imagen seleccionada"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold text-zinc-900 mb-2">
                  {nombre && apellido ? `${nombre} ${apellido}` : 'Mi Perfil'}
                </h1>
                <p className="text-lg text-zinc-600">
                  {profile.email}
                </p>
              </div>
            </div>
          </div>

          {/* Profile Information Card */}
          <div className="rounded-lg bg-white p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-zinc-900 mb-6">Información Personal</h2>

          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">
              {success}
            </div>
          )}

          {/* Profile Fields */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-3 text-zinc-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Nombre
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={!isEditing}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
                style={{ minHeight: '44px' }}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Apellido
              </label>
              <input
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                disabled={!isEditing}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
                style={{ minHeight: '44px' }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3">
            {!isEditing ? (
              <>
                <button
                  onClick={handleEdit}
                  className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800"
                  style={{ minHeight: '44px' }}
                >
                  Editar perfil
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50"
                  style={{ minHeight: '44px' }}
                >
                  Volver
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isUploadingImage}
                  className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                  style={{ minHeight: '44px' }}
                >
                  {isSaving || isUploadingImage ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving || isUploadingImage}
                  className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
                  style={{ minHeight: '44px' }}
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
          </div>

          {/* Account Information Card */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <InformationCircleIcon className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-zinc-900">Información de Cuenta</h2>
            </div>
            
            {/* Email Verification Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-zinc-200">
                <span className="text-sm font-medium text-zinc-700">Email verificado</span>
                <div className="flex items-center gap-2">
                  {user?.emailVerified ? (
                    <>
                      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                        <svg className="mr-1.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Sí
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                        <svg className="mr-1.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        No
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Registration Date */}
              {profile.createdAt ? (
                <div className="flex items-center justify-between py-3 border-b border-zinc-200">
                  <span className="text-sm font-medium text-zinc-700">Fecha de registro</span>
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <CalendarIcon className="h-4 w-4" />
                    <span>
                      {format(new Date(profile.createdAt), 'd MMM yyyy', { locale: es })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between py-3 border-b border-zinc-200">
                  <span className="text-sm font-medium text-zinc-700">Fecha de registro</span>
                  <div className="flex items-center gap-2 text-sm text-zinc-500 italic">
                    <CalendarIcon className="h-4 w-4" />
                    <span>No disponible</span>
                  </div>
                </div>
              )}

              {/* Last Login */}
              {profile.lastLoginAt && (
                <div className="flex items-center justify-between py-3 border-b border-zinc-200">
                  <span className="text-sm font-medium text-zinc-700">Último inicio de sesión</span>
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <CalendarIcon className="h-4 w-4" />
                    <span>
                      {formatDistanceToNow(new Date(profile.lastLoginAt), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </span>
                  </div>
                </div>
              )}

              {/* User ID */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-zinc-700">ID de usuario</span>
                <div className="flex items-center gap-2">
                  {/* User ID Display */}
                  <span className="text-sm font-mono text-zinc-600">
                    {showUserId ? user?.userId : '••••••••••••••••'}
                  </span>
                  
                  {/* Show/Hide Button */}
                  <button
                    onClick={handleToggleUserId}
                    className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    aria-label={showUserId ? 'Ocultar ID de usuario' : 'Mostrar ID de usuario'}
                    title={showUserId ? 'Ocultar' : 'Mostrar'}
                  >
                    {showUserId ? (
                      <EyeSlashIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </button>
                  
                  {/* Copy Button */}
                  <button
                    onClick={handleCopyUserId}
                    className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    aria-label="Copiar ID de usuario"
                    title="Copiar"
                  >
                    {userIdCopied ? (
                      <CheckIcon className="h-4 w-4 text-green-600" />
                    ) : (
                      <ClipboardDocumentIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
