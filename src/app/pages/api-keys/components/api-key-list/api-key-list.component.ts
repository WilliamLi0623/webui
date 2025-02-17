import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, TemplateRef, ViewChild, AfterViewInit,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { untilDestroyed, UntilDestroy } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import {
  Subject, Observable, of,
} from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { ApiKey } from 'app/interfaces/api-key.interface';
import { CoreEvent } from 'app/interfaces/events';
import { GlobalActionConfig } from 'app/interfaces/global-action.interface';
import { EmptyConfig, EmptyType } from 'app/modules/entity/entity-empty/entity-empty.component';
import { EntityToolbarComponent } from 'app/modules/entity/entity-toolbar/entity-toolbar.component';
import { ControlConfig, ToolbarConfig } from 'app/modules/entity/entity-toolbar/models/control-config.interface';
import { ApiKeyFormDialogComponent } from 'app/pages/api-keys/components/api-key-form-dialog/api-key-form-dialog.component';
import { ApiKeyComponentStore } from 'app/pages/api-keys/store/api-key.store';
import { DialogService } from 'app/services';
import { LayoutService } from 'app/services/layout.service';
import { WebSocketService } from 'app/services/ws.service';

@UntilDestroy()
@Component({
  templateUrl: './api-key-list.component.html',
  styleUrls: ['./api-key-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeyListComponent implements OnInit, AfterViewInit {
  @ViewChild(MatSort, { static: false }) sort: MatSort;
  @ViewChild('pageHeader') pageHeader: TemplateRef<unknown>;
  toolbarActionsConfig: GlobalActionConfig = null;

  displayedColumns: string[] = ['name', 'created_at', 'actions'];
  settingsEvent$: Subject<CoreEvent> = new Subject();
  filterString = '';
  dataSource: MatTableDataSource<ApiKey> = new MatTableDataSource([]);
  defaultSort: Sort = { active: 'name', direction: 'asc' };
  filterValue = '';
  loadingConfig: EmptyConfig = {
    type: EmptyType.Loading,
    large: false,
    title: this.translate.instant('Loading...'),
  };
  isLoading$ = this.store.isLoading$;
  emptyOrErrorConfig$: Observable<EmptyConfig> = this.store.isError$.pipe(
    switchMap((hasError) => {
      if (hasError) {
        return of({
          type: EmptyType.Errors,
          large: true,
          title: this.translate.instant('Can not retrieve response'),
        });
      }

      return of({
        type: EmptyType.NoPageData,
        title: this.translate.instant('No API Keys'),
        large: true,
      });
    }),
  );

  constructor(
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private store: ApiKeyComponentStore,
    private layoutService: LayoutService,
    private matDialog: MatDialog,
    private dialog: DialogService,
    private ws: WebSocketService,
  ) { }

  ngOnInit(): void {
    this.getApiKeys();
  }

  ngAfterViewInit(): void {
    this.setupToolbar();
    this.layoutService.pageHeaderUpdater$.next(this.pageHeader);
  }

  shouldShowResetInput(): boolean {
    return this.filterValue && !!this.filterValue.length;
  }

  input(filterInput: HTMLInputElement): void {
    this.filterValue = filterInput.value;
  }

  resetInput(input: HTMLInputElement): void {
    this.filterValue = '';
    input.value = '';
  }

  getApiKeys(): void {
    this.store.apiKeys$.pipe(
      untilDestroyed(this),
    ).subscribe((apiKeys) => {
      this.createDataSource(apiKeys);
      this.cdr.markForCheck();
    }, () => {
      this.createDataSource();
      this.cdr.markForCheck();
    });
  }

  openApiKeyForm(row?: ApiKey): void {
    this.matDialog
      .open(ApiKeyFormDialogComponent, { data: row })
      .afterClosed()
      .pipe(untilDestroyed(this))
      .subscribe();
  }

  doDelete(apiKey: ApiKey): void {
    this.dialog.confirm({
      title: this.translate.instant('Delete API Key'),
      message: this.translate.instant('Are you sure you want to delete the <b>{name}</b> API Key?', { name: apiKey.name }),
      buttonMsg: this.translate.instant('Delete'),
      cancelMsg: this.translate.instant('Cancel'),
    }).pipe(
      filter(Boolean),
      switchMap(() => this.ws.call('api_key.delete', [String(apiKey.id)])),
      untilDestroyed(this),
    ).subscribe(() => {
      this.store.apiKeyDeleted(apiKey.id);
    });
  }

  private createDataSource(apiKeys: ApiKey[] = []): void {
    this.dataSource = new MatTableDataSource(apiKeys);
    if (this.filterString) {
      this.dataSource.filter = this.filterString;
    }
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'name':
          return item.name;
        case 'created_at':
          return item.created_at.$date;
      }
    };
    this.store.patchState({ isLoading: false });
    this.cdr.markForCheck();
  }

  private setupToolbar(): void {
    this.settingsEvent$ = new Subject();
    this.settingsEvent$.pipe(
      untilDestroyed(this),
    ).subscribe((event: CoreEvent) => {
      switch (event.data.event_control) {
        case 'filter':
          this.filterString = event.data.filter;
          this.dataSource.filter = event.data.filter;
          break;
        case 'add':
          this.openApiKeyForm();
          break;
        case 'docs':
          window.open(`${window.location.origin}/api/docs`, '_blank');
          break;
        default:
          break;
      }
    });

    const controls: ControlConfig[] = [
      {
        name: 'filter',
        type: 'input',
        value: this.filterString,
        placeholder: this.translate.instant('Search'),
      },
      {
        name: 'docs',
        type: 'button',
        label: this.translate.instant('API Docs'),
      },
      {
        name: 'add',
        type: 'button',
        label: this.translate.instant('Add'),
        color: 'primary',
      },
    ];

    const toolbarConfig: ToolbarConfig = {
      target: this.settingsEvent$,
      controls,
    };
    this.toolbarActionsConfig = {
      actionType: EntityToolbarComponent,
      actionConfig: toolbarConfig,
    };

    this.cdr.markForCheck();
  }
}
