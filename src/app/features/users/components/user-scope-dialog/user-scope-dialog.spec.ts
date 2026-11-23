import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { UserRecord } from '../../../../models/users.models';
import { RegionsApi } from '../../../towers/data-access/regions-api';
import { UsersApi } from '../../data-access/users-api';
import { UserScopeDialog } from './user-scope-dialog';

const user: UserRecord = { id: 'u1', username: 'insp', fullName: 'Nguyễn Văn A', email: 'a@evn.vn', role: 'Inspector', status: 'Active' };

describe('UserScopeDialog', () => {
  let fixture: ComponentFixture<UserScopeDialog>;
  let usersApi: { getGeographicScopes: ReturnType<typeof vi.fn>; setGeographicScopes: ReturnType<typeof vi.fn> };

  const setup = (editable: boolean) => {
    TestBed.configureTestingModule({
      imports: [UserScopeDialog],
      providers: [
        { provide: UsersApi, useValue: usersApi },
        { provide: RegionsApi, useValue: { getAll: () => of([{ id: 'r1', name: 'Hải Phòng' }, { id: 'r2', name: 'Hà Nội' }]) } },
      ],
    });
    fixture = TestBed.createComponent(UserScopeDialog);
    fixture.componentRef.setInput('user', user);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
  };

  beforeEach(() => {
    usersApi = {
      getGeographicScopes: vi.fn().mockReturnValue(of({ userId: 'u1', regions: [{ regionId: 'r1', code: 'HP', name: 'Hải Phòng', type: '' }] })),
      setGeographicScopes: vi.fn().mockReturnValue(of({ userId: 'u1', regions: [] })),
    };
  });

  const checkboxes = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  it('pre-selects the current scope and saves the full selection', () => {
    setup(true);
    const boxes = checkboxes();
    expect(boxes).toHaveLength(2);
    const selected = boxes.filter((box) => box.checked).map((box) => box.parentElement?.textContent?.trim());
    expect(selected).toEqual(['Hải Phòng']);

    let saved = false;
    fixture.componentInstance.saved.subscribe(() => (saved = true));
    const haNoi = boxes.find((box) => box.parentElement?.textContent?.includes('Hà Nội'))!;
    haNoi.checked = true;
    haNoi.dispatchEvent(new Event('change'));
    (Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.includes('Lưu phạm vi')) as HTMLButtonElement).click();
    expect(usersApi.setGeographicScopes).toHaveBeenCalledWith('u1', expect.arrayContaining(['r1', 'r2']));
    expect(saved).toBe(true);
  });

  it('is read-only for roles that may not edit', () => {
    setup(false);
    const element = fixture.nativeElement as HTMLElement;
    expect(checkboxes()).toHaveLength(0);
    expect(element.textContent).toContain('Hải Phòng');
    expect(element.textContent).not.toContain('Lưu phạm vi');
  });

  it('reports a 403 from the backend rule', () => {
    usersApi.setGeographicScopes.mockReturnValue(throwError(() => ({ status: 403 })));
    setup(true);
    (Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.includes('Lưu phạm vi')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Chỉ Quản trị viên hệ thống hoặc Quản lý');
  });
});
