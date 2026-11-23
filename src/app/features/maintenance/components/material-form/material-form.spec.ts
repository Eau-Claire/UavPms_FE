import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MaterialLog } from '../../../../models/maintenance.models';
import { MaintenanceApi } from '../../data-access/maintenance-api';
import { MaterialForm } from './material-form';

interface FormHarness {
  form: { setValue(value: { componentName: string; componentCode: string; quantityUsed: number; unit: string; fieldObservations: string }): void; invalid: boolean };
  submit(): void;
}

describe('MaterialForm', () => {
  let fixture: ComponentFixture<MaterialForm>;
  let api: { logMaterial: ReturnType<typeof vi.fn> };
  const logged: MaterialLog = { id: 'ml1', componentName: 'Sứ cách điện', componentCode: 'SU-01', quantityUsed: 2, unit: 'cái', fieldObservations: '', loggedAt: '2026-10-31T00:00:00Z' };

  beforeEach(async () => {
    api = { logMaterial: vi.fn().mockReturnValue(of(logged)) };
    TestBed.configureTestingModule({ imports: [MaterialForm], providers: [{ provide: MaintenanceApi, useValue: api }] });
    fixture = TestBed.createComponent(MaterialForm);
    fixture.componentRef.setInput('ticketId', 't1');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('rejects a quantity that is not a positive integer', () => {
    const component = fixture.componentInstance as unknown as FormHarness;
    component.form.setValue({ componentName: 'Sứ', componentCode: '', quantityUsed: 0, unit: 'cái', fieldObservations: '' });
    component.submit();
    expect(api.logMaterial).not.toHaveBeenCalled();
    component.form.setValue({ componentName: 'Sứ', componentCode: '', quantityUsed: 1.5, unit: 'cái', fieldObservations: '' });
    expect(component.form.invalid).toBe(true);
  });

  it('requires a name and a unit', () => {
    const component = fixture.componentInstance as unknown as FormHarness;
    component.form.setValue({ componentName: '  ', componentCode: '', quantityUsed: 1, unit: '', fieldObservations: '' });
    component.submit();
    fixture.detectChanges();
    expect(api.logMaterial).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nhập tên vật tư.');
  });

  it('posts the material and emits it', () => {
    const emitted: MaterialLog[] = [];
    fixture.componentInstance.logged.subscribe((material) => emitted.push(material));
    const component = fixture.componentInstance as unknown as FormHarness;
    component.form.setValue({ componentName: 'Sứ cách điện', componentCode: 'SU-01', quantityUsed: 2, unit: 'cái', fieldObservations: 'Sứ cũ vỡ' });
    component.submit();
    expect(api.logMaterial).toHaveBeenCalledWith('t1', { componentName: 'Sứ cách điện', componentCode: 'SU-01', quantityUsed: 2, unit: 'cái', fieldObservations: 'Sứ cũ vỡ' });
    expect(emitted).toEqual([logged]);
  });
});
