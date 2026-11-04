import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MaintenanceProof } from '../../../../models/maintenance.models';
import { MaintenanceApi } from '../../data-access/maintenance-api';
import { MAX_PROOF_BYTES, proofFileProblem, ProofUpload } from './proof-upload';

interface UploadHarness {
  onFilesSelected(event: Event): void;
  upload(): void;
  pending(): readonly { file: File }[];
  notes: { setValue(value: string): void };
}

const fileEvent = (...files: File[]): Event => ({ target: { files, value: 'x' } }) as unknown as Event;
const image = (name: string) => new File(['img'], name, { type: 'image/jpeg' });

describe('proofFileProblem', () => {
  it('accepts the backend extensions only', () => {
    expect(proofFileProblem(image('a.JPG'))).toBeNull();
    expect(proofFileProblem(image('a.webp'))).toBeNull();
    expect(proofFileProblem(new File(['x'], 'a.pdf'))).toContain('chỉ hỗ trợ ảnh');
    expect(proofFileProblem(new File([], 'a.png'))).toContain('rỗng');
  });

  it('rejects files over 50MB', () => {
    const big = image('big.jpg');
    Object.defineProperty(big, 'size', { value: MAX_PROOF_BYTES + 1 });
    expect(proofFileProblem(big)).toContain('50MB');
  });
});

describe('ProofUpload', () => {
  let fixture: ComponentFixture<ProofUpload>;
  let api: { uploadProof: ReturnType<typeof vi.fn> };
  const proof = (id: string): MaintenanceProof => ({ id, proofType: 'After', fileUrl: `https://img/${id}.jpg`, technicianNotes: 'ok', uploadedAt: '2026-10-31T00:00:00Z' });

  beforeEach(async () => {
    api = { uploadProof: vi.fn() };
    TestBed.configureTestingModule({ imports: [ProofUpload], providers: [{ provide: MaintenanceApi, useValue: api }] });
    fixture = TestBed.createComponent(ProofUpload);
    fixture.componentRef.setInput('ticketId', 't1');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('previews the selected images, drops invalid ones, then uploads each with the notes', () => {
    api.uploadProof.mockImplementation((_id: string, file: File) => of(proof(file.name)));
    const emitted: MaintenanceProof[] = [];
    fixture.componentInstance.uploaded.subscribe((value) => emitted.push(value));
    const component = fixture.componentInstance as unknown as UploadHarness;

    component.onFilesSelected(fileEvent(image('a.jpg'), new File(['x'], 'notes.txt'), image('b.png')));
    fixture.detectChanges();
    expect(component.pending().map((item) => item.file.name)).toEqual(['a.jpg', 'b.png']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('notes.txt: chỉ hỗ trợ ảnh');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.proof-preview').length).toBe(2);

    component.notes.setValue('Đã thay sứ');
    component.upload();
    expect(api.uploadProof).toHaveBeenCalledTimes(2);
    expect(api.uploadProof).toHaveBeenCalledWith('t1', expect.any(File), 'Đã thay sứ');
    expect(emitted.map((item) => item.id)).toEqual(['a.jpg', 'b.png']);
    expect(component.pending()).toEqual([]);
  });

  it('keeps the files that were not uploaded when the backend rejects one', () => {
    api.uploadProof.mockReturnValue(throwError(() => ({ status: 400, error: { errorCode: 'File extension is prohibited', message: 'File extension is prohibited' } })));
    const component = fixture.componentInstance as unknown as UploadHarness;
    component.onFilesSelected(fileEvent(image('a.jpg')));
    component.upload();
    fixture.detectChanges();
    expect(component.pending().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Định dạng tệp không được hỗ trợ');
  });
});
