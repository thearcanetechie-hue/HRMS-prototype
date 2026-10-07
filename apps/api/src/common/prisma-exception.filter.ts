import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Turns the Prisma errors users can cause into clean HTTP responses. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.filter((f) => f !== 'tenantId');
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Already exists${target?.length ? `: ${target.join(', ')}` : ''}`,
        });
      }
      case 'P2025':
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ statusCode: HttpStatus.NOT_FOUND, message: 'Not found' });
      default:
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' });
    }
  }
}
