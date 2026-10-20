import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionExpired =
    inject(ActivatedRoute).snapshot.queryParamMap.get('session') === 'expired';

  readonly mode = signal<AuthMode>('login');
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly sessionMessage = this.sessionExpired
    ? 'Your session expired or is no longer valid. Please sign in again.'
    : '';

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  toggleMode(): void {
    const nextMode = this.mode() === 'login' ? 'register' : 'login';
    this.mode.set(nextMode);
    this.error.set('');
    this.form.controls.name.setValidators(
      nextMode === 'register' ? [Validators.required] : [],
    );
    this.form.controls.name.updateValueAndValidity();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) {
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    const request =
      this.mode() === 'login'
        ? this.auth.login({ email, password })
        : this.auth.register({ name: name.trim(), email, password });

    this.error.set('');
    this.submitting.set(true);
    request.subscribe({
      next: (response) => {
        this.auth.saveToken(response.data.token);
        void this.router.navigateByUrl('/');
      },
      error: (error: unknown) => {
        this.error.set(this.getErrorMessage(error));
        this.submitting.set(false);
      },
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error?.message === 'string') {
        return error.error.message;
      }

      if (error.status === 0) {
        return 'Cannot connect to the task service. Make sure the backend is running on port 5000.';
      }
    }

    return 'We could not complete your request. Please try again.';
  }
}
