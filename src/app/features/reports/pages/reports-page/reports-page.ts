import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';

export interface ReportItem {
  id: string;
  code: string;
  title: string;
  type: 'defect' | 'periodic' | 'thermal' | 'corridor';
  typeName: string;
  lineOrSubstation: string;
  createdAt: string;
  creator: string;
  status: 'approved' | 'pending' | 'draft';
  statusName: string;
  fileSizePdf: string;
  fileSizeExcel: string;
  defectCount: number;
}

const INITIAL_REPORTS: ReportItem[] = [
  {
    id: '1',
    code: 'BC-2026-0108',
    title: 'Báo cáo tổng hợp khuyết tật cách điện và phụ kiện ĐZ 500kV Quảng Trạch - Dốc Sỏi',
    type: 'defect',
    typeName: 'Khuyết tật AI',
    lineOrSubstation: 'ĐZ 500kV Quảng Trạch - Dốc Sỏi',
    createdAt: '2026-09-12T08:30:00Z',
    creator: 'Nguyễn Văn An (Kỹ sư AI)',
    status: 'approved',
    statusName: 'Đã duyệt',
    fileSizePdf: '4.8 MB',
    fileSizeExcel: '1.2 MB',
    defectCount: 8,
  },
  {
    id: '2',
    code: 'BC-2026-0107',
    title: 'Báo cáo kiểm tra định kỳ bằng UAV tháng 09/2026 - ĐZ 220kV Hòa Bình - Nho Quan',
    type: 'periodic',
    typeName: 'Kiểm tra định kỳ UAV',
    lineOrSubstation: 'ĐZ 220kV Hòa Bình - Nho Quan',
    createdAt: '2026-09-10T14:15:00Z',
    creator: 'Trần Đình Trọng (Phi công UAV)',
    status: 'approved',
    statusName: 'Đã duyệt',
    fileSizePdf: '12.4 MB',
    fileSizeExcel: '2.5 MB',
    defectCount: 3,
  },
  {
    id: '3',
    code: 'BC-2026-0106',
    title: 'Báo cáo soi phát nhiệt camera hồng ngoại mối nối tiếp xúc trạm 220kV Tây Hà Nội',
    type: 'thermal',
    typeName: 'Nhiệt hồng ngoại',
    lineOrSubstation: 'TBA 220kV Tây Hà Nội',
    createdAt: '2026-09-08T09:45:00Z',
    creator: 'Lê Hoàng Long (Giám sát vận hành)',
    status: 'approved',
    statusName: 'Đã duyệt',
    fileSizePdf: '8.1 MB',
    fileSizeExcel: '850 KB',
    defectCount: 2,
  },
  {
    id: '4',
    code: 'BC-2026-0105',
    title: 'Báo cáo vi phạm khoảng cách hành lang an toàn lưới điện cao thế quý III/2026',
    type: 'corridor',
    typeName: 'Hành lang tuyến',
    lineOrSubstation: 'ĐZ 500kV Thường Tín - Nho Quan',
    createdAt: '2026-09-05T16:00:00Z',
    creator: 'Phạm Minh Đức (Kỹ sư an toàn)',
    status: 'pending',
    statusName: 'Chờ duyệt',
    fileSizePdf: '6.2 MB',
    fileSizeExcel: '1.8 MB',
    defectCount: 5,
  },
  {
    id: '5',
    code: 'BC-2026-0104',
    title: 'Báo cáo khuyết tật đứt sợi dây chống sét OPGW khoảng cột 45 - 52',
    type: 'defect',
    typeName: 'Khuyết tật AI',
    lineOrSubstation: 'ĐZ 220kV Chèm - Tây Hà Nội',
    createdAt: '2026-08-30T10:20:00Z',
    creator: 'Vũ Quốc Toàn (Phân tích viên)',
    status: 'approved',
    statusName: 'Đã duyệt',
    fileSizePdf: '3.5 MB',
    fileSizeExcel: '620 KB',
    defectCount: 1,
  },
  {
    id: '6',
    code: 'BC-2026-0103',
    title: 'Báo cáo kiểm tra sau bảo dưỡng định kỳ đường dây 110kV Hà Đông - Thanh Oai',
    type: 'periodic',
    typeName: 'Kiểm tra định kỳ UAV',
    lineOrSubstation: 'ĐZ 110kV Hà Đông - Thanh Oai',
    createdAt: '2026-08-25T11:00:00Z',
    creator: 'Đặng Tuấn Tú (Tổ bay UAV)',
    status: 'draft',
    statusName: 'Bản nháp',
    fileSizePdf: '5.9 MB',
    fileSizeExcel: '1.1 MB',
    defectCount: 0,
  },
];

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, FormsModule, NzIconModule, DatePipe],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  protected readonly reports = signal<ReportItem[]>(INITIAL_REPORTS);
  protected readonly searchQuery = signal('');
  protected readonly selectedType = signal('all');
  protected readonly selectedStatus = signal('all');
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly isCreateModalOpen = signal(false);

  // Form tạo báo cáo
  protected newReportTitle = '';
  protected newReportType: ReportItem['type'] = 'defect';
  protected newReportLine = 'ĐZ 500kV Quảng Trạch - Dốc Sỏi';

  protected readonly filteredReports = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const type = this.selectedType();
    const status = this.selectedStatus();

    return this.reports().filter((item) => {
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.lineOrSubstation.toLowerCase().includes(q) ||
        item.creator.toLowerCase().includes(q);

      const matchType = type === 'all' || item.type === type;
      const matchStatus = status === 'all' || item.status === status;

      return matchSearch && matchType && matchStatus;
    });
  });

  protected readonly stats = computed(() => {
    const all = this.reports();
    return {
      total: all.length,
      defect: all.filter((r) => r.type === 'defect').length,
      periodic: all.filter((r) => r.type === 'periodic').length,
      thermal: all.filter((r) => r.type === 'thermal').length,
      corridor: all.filter((r) => r.type === 'corridor').length,
    };
  });

  protected refreshReports(): void {
    this.showToast('Đã làm mới danh mục báo cáo thành công.');
  }

  protected downloadReport(report: ReportItem, format: 'PDF' | 'EXCEL'): void {
    const size = format === 'PDF' ? report.fileSizePdf : report.fileSizeExcel;
    this.showToast(`Đang tải file ${format} cho báo cáo ${report.code} (${size})...`);
  }

  protected openCreateModal(): void {
    this.newReportTitle = '';
    this.newReportType = 'defect';
    this.newReportLine = 'ĐZ 500kV Quảng Trạch - Dốc Sỏi';
    this.isCreateModalOpen.set(true);
  }

  protected closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  protected createReport(): void {
    if (!this.newReportTitle.trim()) {
      this.showToast('Vui lòng nhập tên tiêu đề báo cáo!');
      return;
    }

    const typeNames: Record<ReportItem['type'], string> = {
      defect: 'Khuyết tật AI',
      periodic: 'Kiểm tra định kỳ UAV',
      thermal: 'Nhiệt hồng ngoại',
      corridor: 'Hành lang tuyến',
    };

    const nextCodeNumber = this.reports().length + 109;
    const newReport: ReportItem = {
      id: Date.now().toString(),
      code: `BC-2026-0${nextCodeNumber}`,
      title: this.newReportTitle.trim(),
      type: this.newReportType,
      typeName: typeNames[this.newReportType],
      lineOrSubstation: this.newReportLine,
      createdAt: new Date().toISOString(),
      creator: 'Người vận hành (EVN)',
      status: 'pending',
      statusName: 'Chờ duyệt',
      fileSizePdf: '3.2 MB',
      fileSizeExcel: '920 KB',
      defectCount: 2,
    };

    this.reports.update((list) => [newReport, ...list]);
    this.closeCreateModal();
    this.showToast(`Tạo thành công báo cáo ${newReport.code}!`);
  }

  private showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => {
      if (this.toastMessage() === msg) {
        this.toastMessage.set(null);
      }
    }, 3500);
  }
}
