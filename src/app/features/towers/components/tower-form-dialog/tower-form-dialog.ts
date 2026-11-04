import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RegionLookup, TowerSummary, TowerUpsertRequest } from '../../../../models/assets.models';

/** Modal form for POST /towers and PUT /towers/{id}. The parent performs the request. */
@Component({
  selector: 'app-tower-form-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './tower-form-dialog.html',
  styleUrl: './tower-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TowerFormDialog implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly tower = input<TowerSummary | null>(null);
  readonly regions = input.required<readonly RegionLookup[]>();
  readonly busy = input(false);
  readonly errorMessage = input('');
  readonly submitted = output<TowerUpsertRequest>();
  readonly closed = output<void>();

  protected readonly form = this.fb.group({
    regionId: this.fb.nonNullable.control('', Validators.required),
    towerCode: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(50)]),
    poleType: this.fb.nonNullable.control('', Validators.maxLength(100)),
    address: this.fb.nonNullable.control('', Validators.maxLength(500)),
    latitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-90), Validators.max(90)]),
    longitude: this.fb.control<number | null>(null, [Validators.required, Validators.min(-180), Validators.max(180)]),
  });

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  ngOnInit(): void {
    const tower = this.tower();
    if (tower) {
      this.form.reset({
        regionId: tower.regionId,
        towerCode: tower.towerCode,
        poleType: tower.poleType ?? '',
        address: tower.address ?? '',
        latitude: tower.latitude,
        longitude: tower.longitude,
      });
    }
  }

  protected hasError(control: 'regionId' | 'towerCode' | 'poleType' | 'address' | 'latitude' | 'longitude'): boolean {
    const target = this.form.controls[control];
    return target.invalid && (target.touched || target.dirty);
  }

  protected submit(): void {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      regionId: value.regionId,
      towerCode: value.towerCode.trim(),
      poleType: value.poleType.trim() || undefined,
      address: value.address.trim() || undefined,
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
    });
  }

  /** Native Escape fires `cancel`; route it through the parent so state stays in sync. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Clicking the modal backdrop outside the dialog box dismisses it. */
  protected onBackdropClick(event: MouseEvent): void {
    if (this.busy()) return;
    const dlg = this.dialog().nativeElement;
    const rect = dlg.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      this.close();
    }
  }

  protected close(): void {
    if (!this.busy()) {
      try {
        const dlg = this.dialog()?.nativeElement;
        if (dlg?.open) dlg.close();
      } catch {
        // no-op
      }
      this.closed.emit();
    }
  }
}
