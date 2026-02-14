'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { profileApi, ApiError } from '@/lib/api-client';

interface ProfileData {
  userId: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  profileImage: string | null;
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
  
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
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
    setError('');
    setSuccess('');
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Solo se permiten imágenes JPEG, PNG o WebP');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar 5MB');
      return;
    }

    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    setError('');
  };

  const uploadProfileImage = async (file: File) => {
    try {
      setIsUploadingImage(true);
      
      // Get pre-signed URL
      const { presignedUrl, s3Key } = await profileApi.getImageUploadUrl(
        file.name,
        file.type
      );
      
      // Upload to S3
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Error al subir la imagen');
      }
    } catch (err) {
      throw new Error('Error al subir la imagen de perfil');
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
    <div className="min-h-screen bg-zinc-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-zinc-900">Mi Perfil</h1>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          {/* Profile Image */}
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 h-32 w-32 overflow-hidden rounded-full bg-zinc-200">
              {imagePreview || profile.profileImage ? (
                <img
                  src={imagePreview || profile.profileImage || ''}
                  alt="Foto de perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-zinc-400">
                  {nombre.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
            
            {isEditing && (
              <label className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200">
                Cambiar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

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
  );
}
