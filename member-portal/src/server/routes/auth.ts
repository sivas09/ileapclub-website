import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, signToken } from "../auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post("/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: "Enter a valid email and password." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });

  if (!user || !user.isActive) {
    response.status(401).json({ message: "Invalid email or password." });
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
    user: {
      ...sessionUser,
      firstName: user.firstName,
      lastName: user.lastName
    }
  });
});

authRouter.get("/me", requireAuth, async (request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user?.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true
    }
  });

  if (!user || !user.isActive) {
    response.status(401).json({ message: "Session user no longer exists." });
    return;
  }

  response.json({ user });
});
