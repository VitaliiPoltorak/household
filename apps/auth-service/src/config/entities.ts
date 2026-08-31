import { AuditLog } from '@household/audit';
import { User } from '../users/entities/user.entity';
import { AuthProvider } from '../users/entities/auth-provider.entity';

export const entities = [User, AuthProvider, AuditLog];
