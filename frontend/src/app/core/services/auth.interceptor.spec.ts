import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from './api.config';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTestingController: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.removeItem('task-management.auth-token');
    navigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpTestingController.verify();
    auth.clearToken();
  });

  it('attaches the stored bearer token to protected API calls', () => {
    auth.saveToken('signed-token');

    http.get(`${API_BASE_URL}/tasks`).subscribe();

    const request = httpTestingController.expectOne(`${API_BASE_URL}/tasks`);
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer signed-token',
    );
    request.flush({ success: true });
  });

  it('does not attach the stored token to authentication calls', () => {
    auth.saveToken('signed-token');

    http.post(`${API_BASE_URL}/auth/login`, {}).subscribe();

    const request = httpTestingController.expectOne(
      `${API_BASE_URL}/auth/login`,
    );
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ success: true });
  });

  it('clears a rejected token and redirects to sign in', () => {
    auth.saveToken('expired-token');

    http.get(`${API_BASE_URL}/tasks`).subscribe({ error: () => undefined });

    httpTestingController
      .expectOne(`${API_BASE_URL}/tasks`)
      .flush(
        { success: false, message: 'Invalid or expired authentication token' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(auth.getToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { session: 'expired' },
    });
  });
});
