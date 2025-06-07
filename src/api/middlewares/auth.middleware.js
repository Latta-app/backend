import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        code: 'AUTH_NO_TOKEN',
        message: 'Token não fornecido',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    return res.status(401).json({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Token inválido ou expirado',
    });
  }
};

const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          code: 'AUTH_NO_USER',
          message: 'Usuário não autenticado',
        });
      }

      if (!req.user.roles || !Array.isArray(req.user.roles) || req.user.roles.length === 0) {
        return res.status(403).json({
          code: 'AUTH_NO_ROLES',
          message: 'Usuário não possui roles definidas',
        });
      }

      const userRoles = req.user.roles
        .map((roleObj) => roleObj.role?.toLowerCase())
        .filter((role) => role);

      const hasPermission = allowedRoles.some((allowedRole) =>
        userRoles.includes(allowedRole.toLowerCase()),
      );

      if (!hasPermission) {
        return res.status(403).json({
          code: 'AUTH_FORBIDDEN',
          message: 'Acesso não autorizado para este perfil',
        });
      }

      next();
    } catch (error) {
      console.error('Erro no checkRole:', error);
      return res.status(500).json({
        code: 'AUTH_ERROR',
        message: 'Erro ao verificar permissões',
      });
    }
  };
};

const routeGuard = (allowedTypes) => {
  return (req, res, next) => {
    try {
      const userRole = req.user.role?.toLowerCase();

      if (
        allowedTypes === 'veterinary' &&
        !['veterinary', 'admin', 'superadmin'].includes(userRole)
      ) {
        return res.status(403).json({
          code: 'ACCESS_DENIED',
          message: 'Esta rota é exclusiva para veterinários',
        });
      }

      if (allowedTypes === 'petowner' && userRole !== 'petowner') {
        return res.status(403).json({
          code: 'ACCESS_DENIED',
          message: 'Esta rota é exclusiva para tutores',
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        code: 'GUARD_ERROR',
        message: 'Erro ao verificar permissões de rota',
      });
    }
  };
};

export { verifyToken, checkRole, routeGuard };
