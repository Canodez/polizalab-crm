import { updatePassword } from 'aws-amplify/auth';

function mapCognitoError(error: any): string {
  const name = error?.name || '';
  switch (name) {
    case 'NotAuthorizedException':
      return 'Contraseña actual incorrecta';
    case 'InvalidPasswordException':
      return 'La nueva contraseña no cumple los requisitos';
    case 'LimitExceededException':
      return 'Demasiados intentos. Intenta más tarde';
    default:
      return error?.message || 'Error al cambiar la contraseña';
  }
}

export const securityApi = {
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      await updatePassword({ oldPassword, newPassword });
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  },
};
