import { EventEmitter } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { EntityJobComponent } from 'app/modules/entity/entity-job/entity-job.component';

/**
 * Usage:
 *
 * mockProvider(MatDialog, {
 *   open: jest.fn(() => mockDialogRef),
 * }),
 */
export const mockEntityJobComponentRef = {
  componentInstance: {
    setDescription: jest.fn(),
    setCall: jest.fn(),
    submit: jest.fn(),
    success: of(null),
    failure: new EventEmitter(),
  },
  close: jest.fn(),
} as unknown as MatDialogRef<EntityJobComponent>;
