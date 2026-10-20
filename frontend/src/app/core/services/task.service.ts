import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  ApiResponse,
  Task,
  TaskDraft,
  TaskListResponse,
} from '../models/task.model';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/tasks`;
  private readonly pageSize = 100;

  getAllTasks(): Observable<Task[]> {
    return this.getPage(1).pipe(
      switchMap((firstPage) => {
        const remainingPages = Array.from(
          { length: Math.max(0, firstPage.pagination.totalPages - 1) },
          (_, index) => index + 2,
        );

        if (remainingPages.length === 0) {
          return of(firstPage.data);
        }

        return forkJoin(remainingPages.map((page) => this.getPage(page))).pipe(
          map((pages) => [
            ...firstPage.data,
            ...pages.flatMap((page) => page.data),
          ]),
        );
      }),
    );
  }

  createTask(task: TaskDraft): Observable<ApiResponse<Task>> {
    return this.http.post<ApiResponse<Task>>(this.apiUrl, task);
  }

  updateTask(id: string, task: TaskDraft): Observable<ApiResponse<Task>> {
    return this.http.put<ApiResponse<Task>>(`${this.apiUrl}/${id}`, task);
  }

  deleteTask(id: string): Observable<ApiResponse<Task>> {
    return this.http.delete<ApiResponse<Task>>(`${this.apiUrl}/${id}`);
  }

  private getPage(page: number): Observable<TaskListResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('limit', this.pageSize);

    return this.http.get<TaskListResponse>(this.apiUrl, { params });
  }
}
