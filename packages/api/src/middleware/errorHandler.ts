import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    if (prismaError.code === 'P2002') {
      return res.status(409).json({
        error: 'Resource already exists',
      });
    }
    if (prismaError.code === 'P2025') {
      return res.status(404).json({
        error: 'Resource not found',
      });
    }
  }

  // Default error
  res.status(500).json({
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Internal server error',
  });
}
