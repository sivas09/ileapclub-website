import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, signToken } from "../auth.js";
import { memberUserSelect, safeUserDto } from "../services/safeUser.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export function isValidNewPassword(password: string) {
  return password.length >= 8;
}

export const authRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_request, response) => {
    response.status(429).json({
      message: "Too many login attempts. Please wait 15 minutes and try again."
    });
  }
});

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

authRouter.post("/login", loginRateLimiter, asyncRoute(async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a valid email and password." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: {
      ...memberUserSelect,
      passwordHash: true
    }
  });

  if (!user || !user.isActive) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  if (user.role === Role.PARENT) {
    response.status(403).json({ message: "Parent accounts are not enabled for this portal." });
    return;
  }

  const isValidPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);

  if (!isValidPassword) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  response.json({
    token: signToken(sessionUser),
    user: safeUserDto(user)
  });
}));

authRouter.get("/me", requireAuth, asyncRoute(async (request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user?.id },
    select: memberUserSelect
  });

  if (!user || !user.isActive) {
    response.status(401).json({ message: "Session user no longer exists." });
    return;
  }

  if (user.role === Role.PARENT) {
    response.status(403).json({ message: "Parent accounts are not enabled for this portal." });
    return;
  }

  response.json({ user: safeUserDto(user) });
}));

authRouter.post("/change-password", requireAuth, asyncRoute(async (request, response) => {
  const parsed = changePasswordSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter your current password and a new password of at least 8 characters." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: request.user!.id },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      role: true
    }
  });

  if (!user?.isActive || user.role === Role.PARENT) {
    response.status(401).json({ message: "Session user no longer exists." });
    return;
  }

  const isValidPassword = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);

  if (!isValidPassword) {
    response.status(403).json({ message: "Current password is incorrect." });
    return;
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    response.status(400).json({ message: "Choose a new password that is different from your current password." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
    select: { id: true }
  });

  response.json({ ok: true });
}));
