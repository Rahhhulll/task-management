import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import {
  Task,
  TaskDraft,
  TaskPriority,
  TaskPriorityFilter,
  TaskStatus,
  TaskStatusFilter,
} from '../../../../core/models/task.model';
import { TaskService } from '../../../../core/services/task.service';

type TaskForm = FormGroup<{
  title: FormControl<string>;
  description: FormControl<string>;
  status: FormControl<TaskStatus>;
  priority: FormControl<TaskPriority>;
  dueDate: FormControl<string>;
}>;

@Component({
  selector: 'app-task-dashboard',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './task-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDashboard {
  private readonly taskService = inject(TaskService);

  readonly today = new Date();
  readonly tasks = signal<Task[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly statusFilter = signal<TaskStatusFilter>('all');
  readonly priorityFilter = signal<TaskPriorityFilter>('all');
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly statusSelections = signal<Record<string, TaskStatus>>({});
  readonly updatingStatusIds = signal<ReadonlySet<string>>(new Set());
  readonly taskDialogOpen = signal(false);
  readonly editingTask = signal<Task | null>(null);
  readonly taskToDelete = signal<Task | null>(null);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(this.searchControl.value),
      debounceTime(250),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  readonly taskForm: TaskForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    status: new FormControl<TaskStatus>('pending', { nonNullable: true }),
    priority: new FormControl<TaskPriority>('medium', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
  });

  readonly pendingCount = computed(
    () => this.tasks().filter((task) => task.status === 'pending').length,
  );
  readonly inProgressCount = computed(
    () => this.tasks().filter((task) => task.status === 'in_progress').length,
  );
  readonly completedCount = computed(
    () => this.tasks().filter((task) => task.status === 'completed').length,
  );
  readonly filteredTasks = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase();
    const status = this.statusFilter();
    const priority = this.priorityFilter();

    return this.tasks().filter((task) => {
      const matchesSearch = !term || task.title.toLocaleLowerCase().includes(term);
      const matchesStatus = status === 'all' || task.status === status;
      const matchesPriority = priority === 'all' || task.priority === priority;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  });
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTasks().length / this.pageSize)),
  );
  readonly visiblePage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly visibleTasks = computed(() => {
    const start = (this.visiblePage() - 1) * this.pageSize;
    return this.filteredTasks().slice(start, start + this.pageSize);
  });

  readonly statuses: TaskStatus[] = ['pending', 'in_progress', 'completed'];
  readonly priorities: TaskPriority[] = ['low', 'medium', 'high'];

  constructor() {
    this.loadTasks();
  }

  loadTasks(showLoading = true): void {
    this.error.set('');
    if (showLoading) {
      this.loading.set(true);
    }

    this.taskService.getAllTasks().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.getErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  openCreateDialog(): void {
    this.editingTask.set(null);
    this.taskForm.reset({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      dueDate: '',
    });
    this.error.set('');
    this.taskDialogOpen.set(true);
  }

  openEditDialog(task: Task): void {
    this.editingTask.set(task);
    this.taskForm.reset({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? this.toDateInput(task.dueDate) : '',
    });
    this.error.set('');
    this.taskDialogOpen.set(true);
  }

  closeTaskDialog(): void {
    if (!this.saving()) {
      this.taskDialogOpen.set(false);
    }
  }

  saveTask(): void {
    if (this.saving()) {
      return;
    }

    this.taskForm.markAllAsTouched();
    if (this.taskForm.invalid) {
      return;
    }

    const value = this.taskForm.getRawValue();
    const payload: TaskDraft = {
      title: value.title.trim(),
      description: value.description.trim(),
      status: value.status,
      priority: value.priority,
      dueDate: value.dueDate || null,
    };
    const taskToEdit = this.editingTask();

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const request = taskToEdit
      ? this.taskService.updateTask(taskToEdit._id, payload)
      : this.taskService.createTask(payload);

    request.subscribe({
      next: (response) => {
        this.taskDialogOpen.set(false);
        this.saving.set(false);
        this.notice.set(
          taskToEdit ? 'Task updated successfully.' : 'Task created successfully.',
        );
        this.page.set(1);
        this.loadTasks(false);
        if (!taskToEdit) {
          this.statusFilter.set('all');
          this.priorityFilter.set('all');
          this.searchControl.setValue('');
        }
        this.tasks.update((tasks) =>
          taskToEdit
            ? tasks.map((task) =>
                task._id === response.data._id ? response.data : task,
              )
            : [response.data, ...tasks],
        );
      },
      error: (error: unknown) => {
        this.error.set(this.getErrorMessage(error));
        this.saving.set(false);
      },
    });
  }

  changeStatus(task: Task, event: Event): void {
    const status = (event.target as HTMLSelectElement).value as TaskStatus;
    if (
      !this.statuses.includes(status) ||
      status === task.status ||
      this.updatingStatusIds().has(task._id)
    ) {
      return;
    }

    this.statusSelections.update((selections) => ({
      ...selections,
      [task._id]: status,
    }));
    this.updatingStatusIds.update((ids) => new Set(ids).add(task._id));

    this.taskService.updateTask(task._id, this.toDraft(task, status)).subscribe({
      next: (response) => {
        this.tasks.update((tasks) =>
          tasks.map((item) =>
            item._id === response.data._id ? response.data : item,
          ),
        );
        this.clearStatusSelection(task._id);
        this.notice.set('Task status updated.');
        this.error.set('');
      },
      error: (error: unknown) => {
        this.clearStatusSelection(task._id);
        this.error.set(this.getErrorMessage(error));
      },
    });
  }

  confirmDelete(): void {
    const task = this.taskToDelete();
    if (!task || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    this.taskService.deleteTask(task._id).subscribe({
      next: () => {
        this.tasks.update((tasks) => tasks.filter((item) => item._id !== task._id));
        this.taskToDelete.set(null);
        this.saving.set(false);
        this.notice.set('Task deleted successfully.');
      },
      error: (error: unknown) => {
        this.error.set(this.getErrorMessage(error));
        this.saving.set(false);
      },
    });
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.statusFilter.set('all');
    this.priorityFilter.set('all');
    this.page.set(1);
  }

  setStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as TaskStatusFilter);
    this.page.set(1);
  }

  setPriorityFilter(event: Event): void {
    this.priorityFilter.set(
      (event.target as HTMLSelectElement).value as TaskPriorityFilter,
    );
    this.page.set(1);
  }

  previousPage(): void {
    this.page.set(Math.max(1, this.visiblePage() - 1));
  }

  nextPage(): void {
    this.page.set(Math.min(this.totalPages(), this.visiblePage() + 1));
  }

  statusLabel(status: TaskStatus): string {
    return status === 'in_progress' ? 'In progress' : this.capitalize(status);
  }

  capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  trackTask(_index: number, task: Task): string {
    return task._id;
  }

  private toDateInput(value: string): string {
    return value.slice(0, 10);
  }

  private toDraft(task: Task, status: TaskStatus): TaskDraft {
    return {
      title: task.title,
      description: task.description ?? '',
      status,
      priority: task.priority,
      dueDate: task.dueDate ?? null,
    };
  }

  private clearStatusSelection(taskId: string): void {
    this.statusSelections.update((selections) => {
      const next = { ...selections };
      delete next[taskId];
      return next;
    });
    this.updatingStatusIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Cannot connect to the task service. Make sure the backend is running on port 5000.';
      }

      if (typeof error.error?.message === 'string') {
        return error.error.message;
      }

      return 'The request could not be completed. Please try again.';
    }

    return 'Something went wrong. Please try again.';
  }
}
