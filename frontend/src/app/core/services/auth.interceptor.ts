import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { AuthService } from './auth.service';

const isProtectedApiRequest = (url: string): boolean =>
  url.startsWith(`${API_BASE_URL}/`) &&
  !url.startsWith(`${API_BASE_URL}/auth/`);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isProtectedApiRequest(request.url)) {
    return next(request);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();
  const authenticatedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.clearToken();
        void router.navigate(['/login'], {
          queryParams: { session: 'expired' },
        });
      }

      return throwError(() => error);
    }),
  );
};
