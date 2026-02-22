'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/lib/auth-context';
import { profileApi, ApiError } from '@/lib/api-client';
import UserMenu from '@/components/UserMenu';
import ImagePreview from '@/components/ImagePreview';
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ProfileData {
  userId: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  profileImage: string | null;
  profileImageUrl: string | null;
  createdAt: string;
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
      await uploadProfileImage(selectedFile);
      
      // Update profile to save the image URL
      await profileApi.updateProfile({
        nombre: nombre.trim() || profile?.nombre || '',
        apellido: apellido.trim() || profile?.apellido || '',
      });
      
      setSuccess('Imagen de perfil actualizada correctamente');
      setShowImagePreview(false);
      setSelectedFile(null);
      setImagePreview(null);
      
      // Reload profile to get updated data
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
      let s3Key: string;
      
      try {
        const response = await profileApi.getImageUploadUrl(
          file.name,
          file.type
        );
        presignedUrl = response.presignedUrl;
        s3Key = response.s3Key;
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
                <p className="text-lg text-zinc-600 mb-4">
                  {profile.email}
                </p>
                <div className="text-sm text-zinc-500">
                  Miembro desde {new Date(profile.createdAt).toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Profile Information Card */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
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
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 disabled:bg-zinc-100 disabled:text-zinc-500"
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
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 disabled:bg-zinc-100 disabled:text-zinc-500"
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
