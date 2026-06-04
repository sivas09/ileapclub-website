import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "./config.js";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: "8h" });
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    response.status(401).json({ message: "Authentication required." });
    return;
  }

  try {
    request.user = jwt.verify(token, config.JWT_SECRET) as AuthUser;
    next();
  } catch {
    response.status(401).json({ message: "Session expired. Please sign in again." });
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
