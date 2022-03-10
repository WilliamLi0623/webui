import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { AbstractControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormBuilder } from '@ngneat/reactive-forms';
import { untilDestroyed, UntilDestroy } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import _ from 'lodash';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { choicesToOptions } from 'app/helpers/options.helper';
import helptext from 'app/helptext/account/user-form';
import { User } from 'app/interfaces/user.interface';
import { forbiddenValues } from 'app/modules/entity/entity-form/validators/forbidden-values-validation';
import { numberValidator } from 'app/modules/entity/entity-form/validators/number-validation';
import { matchOtherValidator } from 'app/modules/entity/entity-form/validators/password-validation/password-validation';
import { SimpleAsyncComboboxProvider } from 'app/modules/ix-forms/classes/simple-async-combobox-provider';
import { FormErrorHandlerService } from 'app/modules/ix-forms/services/form-error-handler.service';
import IxValidatorsService from 'app/modules/ix-forms/services/ix-validators.service';
import { WebSocketService, DialogService, UserService } from 'app/services';
import { FilesystemService } from 'app/services/filesystem.service';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { StorageService } from 'app/services/storage.service';

@UntilDestroy()
@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormComponent implements OnInit {
  private editingUser: User;
  get isNew(): boolean {
    return !this.editingUser;
  }
  get title(): string {
    return this.isNew ? this.translate.instant('Add User') : this.translate.instant('Edit User');
  }
  isFormLoading = false;
  isBasicMode = true;

  form = this.fb.group({
    full_name: ['', [Validators.required]],
    username: ['', [
      Validators.required,
      Validators.pattern(UserService.namePattern),
      Validators.maxLength(16),
      this.validatorsService.validateOnCondition(
        (control: AbstractControl) => (control.value as string).length > 8,
        this.validatorsService.withMessage(
          Validators.required,
          {
            forProperty: 'required',
            message: this.translate.instant('Usernames can be up to 16 characters long. When using NIS or other legacy software with limited username lengths, keep usernames to eight characters or less for compatibility.'),
          },
        ),
      ),
    ]],
    email: ['', [Validators.email]],
    password: ['', [Validators.pattern('^[^?]*$'), Validators.required]],
    password_conf: ['', [
      Validators.required,
      this.validatorsService.withMessage(
        matchOtherValidator('password'),
        {
          message: this.translate.instant('Password and confirmation should match.'),
          forProperty: 'matchOther',
        },
      ),
    ]],
    password_edit: ['', [Validators.pattern('^[^?]*$')]],
    password_conf_edit: ['', [
      this.validatorsService.withMessage(
        matchOtherValidator('password_edit'),
        {
          message: this.translate.instant('New password and confirmation should match.'),
          forProperty: 'matchOther',
        },
      ),
    ]],
    uid: [null as number, [Validators.required, numberValidator()]],
    group: [null as number],
    group_create: [true],
    groups: [[] as number[]],
    home: ['/nonexistent', []],
    home_mode: ['775'],
    sshpubkey: [''],
    password_disabled: [false],
    shell: [''],
    locked: [false],
    sudo: [false],
    microsoft_account: [false],
    smb: [true],
  });

  readonly tooltips = {
    full_name: helptext.user_form_full_name_tooltip,
    username: helptext.user_form_username_tooltip,
    email: helptext.user_form_email_tooltip,
    password: helptext.user_form_password_tooltip,
    password_edit: helptext.user_form_password_edit_tooltip,
    password_conf_edit: helptext.user_form_password_edit_tooltip,
    uid: helptext.user_form_uid_tooltip,
    group: helptext.user_form_primary_group_tooltip,
    group_create: helptext.user_form_group_create_tooltip,
    groups: helptext.user_form_aux_groups_tooltip,
    home: helptext.user_form_dirs_explorer_tooltip,
    home_mode: helptext.user_form_home_dir_permissions_tooltip,
    sshpubkey: helptext.user_form_auth_sshkey_tooltip,
    password_disabled: helptext.user_form_auth_pw_enable_tooltip,
    shell: helptext.user_form_shell_tooltip,
    locked: helptext.user_form_lockuser_tooltip,
    sudo: helptext.user_form_sudo_tooltip,
    microsoft_account: helptext.user_form_microsoft_tooltip,
    smb: helptext.user_form_smb_tooltip,
  };

  readonly groupOptions$ = this.ws.call('group.query').pipe(
    map((groups) => groups.map((group) => ({ label: group.group, value: group.id }))),
  );
  readonly shellOptions$ = this.ws.call('user.shell_choices').pipe(choicesToOptions());
  readonly treeNodeProvider = this.filesystemService.getFilesystemNodeProvider();
  shellProvider = new SimpleAsyncComboboxProvider(this.shellOptions$);
  groupProvider = new SimpleAsyncComboboxProvider(this.groupOptions$);

  constructor(
    private ws: WebSocketService,
    private errorHandler: FormErrorHandlerService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private dialogService: DialogService,
    private translate: TranslateService,
    private validatorsService: IxValidatorsService,
    private filesystemService: FilesystemService,
    private slideIn: IxSlideInService,
    private storageService: StorageService,
  ) { }

  ngOnInit(): void {
    console.info('init');
  }

  /**
   * @param user Skip argument to add new user.
   */
  setupForm(user?: User): void {
    this.editingUser = user;
    if (this.isNew) {
      this.setupNewUserForm();
    } else {
      this.setupEditUserForm(user);
    }
  }

  private setupNewUserForm(): void {
    this.form.get('password_edit').disable();
    this.form.get('password_conf_edit').disable();
    this.setNamesInUseValidator();
    this.getHomeSharePath();

    this.ws.call('user.get_next_uid').pipe(untilDestroyed(this)).subscribe((nextUid) => {
      this.form.patchValue({ uid: nextUid });
    });

    this.shellOptions$.pipe(
      filter((shells) => !!shells.length),
      map((shells) => shells[0].value),
      untilDestroyed(this),
    ).subscribe((firstShell: string) => {
      this.form.patchValue({ shell: firstShell });
    });

    this.form.get('full_name').valueChanges.pipe(untilDestroyed(this)).subscribe(
      (fullName) => {
        const username = this.getUserName(fullName);
        if (username) {
          this.form.patchValue({ username });
        }
      },
    );

    this.form.get('password_disabled').valueChanges.pipe(untilDestroyed(this)).subscribe(
      (passwordDisabled: boolean) => {
        if (!passwordDisabled) {
          this.form.patchValue({
            sudo: false,
            locked: false,
          });
          this.form.get('password').disable();
          this.form.get('password_conf').disable();
        } else {
          this.form.get('password').enable();
          this.form.get('password_conf').enable();
        }
      },
    );
  }

  private setupEditUserForm(user: User): void {
    this.form.get('password').disable();
    this.form.get('password_conf').disable();
    this.form.get('uid').disable();
    this.form.patchValue({
      uid: user.uid,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      password_disabled: user.password_disabled,
      locked: user.locked,
      sudo: user.sudo,
      microsoft_account: user.microsoft_account,
      sshpubkey: user.sshpubkey,
      groups: user.groups,
      home: user.home,
      smb: user.smb,
      group: user.group.id,
      group_create: false,
    });

    if (user.home !== '/nonexistent') {
      this.storageService.filesystemStat(user.home).pipe(untilDestroyed(this)).subscribe((stat) => {
        this.form.patchValue({ home_mode: stat.mode.toString(8).substring(2, 5) });
      });
    } else {
      this.form.patchValue({ home_mode: '755' });
    }

    if (user.builtin) {
      this.form.get('username').disable();
      this.form.get('group').disable();
      this.form.get('home').disable();
      this.form.get('home_mode').disable();
    } else {
      this.form.patchValue({ shell: user.shell });
    }

    this.setNamesInUseValidator(user.username);
  }

  private getHomeSharePath(): void {
    this.ws.call('sharing.smb.query', [
      [['enabled', '=', true], ['home', '=', true]],
    ]).pipe(
      filter((shares) => !!shares.length),
      map((shares) => shares[0].path),
      untilDestroyed(this),
    ).subscribe((path) => {
      const homeSharePath = path;
      this.form.patchValue({ home: homeSharePath });
      this.form.get('username').valueChanges.pipe(
        untilDestroyed(this),
      ).subscribe((username: string) => {
        this.form.patchValue({ home: `${homeSharePath}/${username}` });
      });
    });
  }

  private setNamesInUseValidator(currentName?: string): void {
    this.ws.call('user.query').pipe(untilDestroyed(this)).subscribe((users) => {
      let forbiddenNames = users.map((user) => user.username);
      if (currentName) {
        forbiddenNames = _.remove(forbiddenNames, currentName);
      }
      this.form.get('username').addValidators(forbiddenValues(forbiddenNames));
    });
  }

  onSubmit(): void {
    const values = this.form.value;
    const commonBody = {
      username: values.username,
      smb: values.smb,
      sudo: values.sudo,
    };

    this.isFormLoading = true;
    let request$: Observable<unknown>;
    if (this.isNew) {
      request$ = this.ws.call('user.create', [{
        ...commonBody,
        uid: values.uid,
      }]);
    } else {
      request$ = this.ws.call('user.update', [
        this.editingUser.id,
        commonBody,
      ]);
    }

    request$.pipe(untilDestroyed(this)).subscribe(() => {
      this.isFormLoading = false;
      this.slideIn.close();
      this.cdr.markForCheck();
    }, (error) => {
      this.isFormLoading = false;
      this.errorHandler.handleWsFormError(error, this.form);
      this.cdr.markForCheck();
    });
  }

  onDownloadSshPublicKey(): void {
    console.info('onDownloadSshPublicKeyClicked');
  }

  getUserName(fullName: string): string {
    let username: string;
    const formatted = fullName.split(/[\s,]+/);
    if (formatted.length === 1) {
      username = formatted[0];
    } else {
      username = formatted[0][0] + formatted.pop();
    }
    if (username.length >= 8) {
      username = username.substring(0, 8);
    }

    return username.toLocaleLowerCase();
  }
}
