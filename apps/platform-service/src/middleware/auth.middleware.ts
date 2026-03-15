import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers["token"] as string;

  try {
    const decoded = jwt.verify(token, process.env["JWT_SECRET"]!) as jwt.JwtPayload;
    (req as AuthRequest).userId = decoded["sub"] as unknown as number;
    next();
  } catch {
    res.status(403).json({
      message: "You are not signed in",
      error: "Invalid or expired token",
    });
  }
}
