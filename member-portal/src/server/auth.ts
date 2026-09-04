import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  sessionVersion?: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign({ ...user, sessionVersion: user.sessionVersion ?? 0 }, config.JWT_SECRET, { expiresIn: "8h" });
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    response.status(401).json({ message: "Authentication required." });
    return;
  }

  try {
    const tokenUser = jwt.verify(token, config.JWT_SECRET) as AuthUser;
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        sessionVersion: true
      }
    });

    if (!user?.isActive) {
      response.status(401).json({ message: "Session user no longer exists." });
      return;
    }

    if ((tokenUser.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
      response.status(401).json({ message: "Session expired. Please sign in again." });
      return;
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion ?? 0
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      response.status(401).json({ message: "Session expired. Please sign in again." });
      return;
    }

    next(error);
  }
}

export function requireRole(roles: Role[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ message: "You do not have permission to access this resource." });
      return;
    }

    next();
  };
}
