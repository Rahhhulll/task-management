import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskStatus } from './core/models/task.model';
import { routes } from './app.routes';
import { TaskDashboard } from './features/tasks/pages/task-dashboard/task-dashboard';

describe('TaskDashboard', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskDashboard],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('loads real tasks and renders the dashboard empty state', async () => {
    const fixture = TestBed.createComponent(TaskDashboard);
    fixture.detectChanges();

    const request = httpTestingController.expectOne(
      (request) =>
        request.url === 'http://localhost:5000/api/tasks' &&
        request.params.get('page') === '1' &&
        request.params.get('limit') === '100',
    );
    request.flush({
      success: true,
      message: 'Tasks retrieved successfully',
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement as HTMLElement;
    expect(content.querySelector('h1')?.textContent).toContain('My tasks');
    expect(content.textContent).toContain('Your task list is a blank canvas');
  });

  it('submits each API task status and counts in-progress tasks', () => {
    const fixture = TestBed.createComponent(TaskDashboard);
    fixture.detectChanges();

    httpTestingController
      .expectOne('http://localhost:5000/api/tasks?page=1&limit=100')
      .flush({
        success: true,
        message: 'Tasks retrieved successfully',
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

    const dashboard = fixture.componentInstance;
    const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed'];
    const createdTasks: {
      _id: string;
      title: string;
      status: TaskStatus;
      priority: 'medium';
      createdAt: string;
      updatedAt: string;
    }[] = [];

    statuses.forEach((status, index) => {
      dashboard.openCreateDialog();
      fixture.detectChanges();
      if (index === 0) {
        const statusOptions = Array.from(
          (
            fixture.nativeElement as HTMLElement
          ).querySelectorAll<HTMLSelectElement>(
            '.task-modal select[formControlName="status"] option',
          ),
        );
        expect(statusOptions.map((option) => option.value)).toEqual(statuses);
        expect(statusOptions[1].textContent?.trim()).toBe('In progress');
      }
      dashboard.taskForm.controls.title.setValue(`Task ${index}`);
      dashboard.taskForm.controls.status.setValue(status);
      dashboard.saveTask();

      const createRequest = httpTestingController.expectOne(
        'http://localhost:5000/api/tasks',
      );
      expect(createRequest.request.method).toBe('POST');
      expect(createRequest.request.body.status).toBe(status);

      const task = {
        _id: `task-${index}`,
        title: `Task ${index}`,
        status,
        priority: 'medium' as const,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      };
      createdTasks.push(task);
      createRequest.flush({
        success: true,
        message: 'Task created successfully',
        data: task,
      });

      httpTestingController
        .expectOne('http://localhost:5000/api/tasks?page=1&limit=100')
        .flush({
          success: true,
          message: 'Tasks retrieved successfully',
          data: [...createdTasks],
          pagination: {
            page: 1,
            limit: 100,
            total: createdTasks.length,
            totalPages: 1,
          },
        });
    });

    expect(dashboard.inProgressCount()).toBe(1);
  });
});
