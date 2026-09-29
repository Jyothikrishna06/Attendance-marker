import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types.js';
import { ForbiddenError, UnauthorizedError } from '../errors.js';

/**
 * RBAC Guard middleware that restricts route access to specified roles.
 * Must be mounted AFTER authenticate middleware.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required before role verification');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' is not authorized to access this resource. Required one of: [${allowedRoles.join(', ')}]`,
        'ROLE_NOT_AUTHORIZED',
        { userRole: req.user.role, requiredRoles: allowedRoles }
      );
    }

    next();
  };
}
