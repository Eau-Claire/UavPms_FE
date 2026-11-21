import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  AimOutline, AlertOutline, AppstoreOutline, ArrowDownOutline, ArrowLeftOutline, ArrowRightOutline, ArrowUpOutline,
  AuditOutline, BankOutline, BellOutline, BorderOutline, BranchesOutline, CalculatorOutline, CalendarOutline,
  CheckCircleOutline, CheckOutline, CheckSquareOutline, ClearOutline, ClockCircleOutline, CloseCircleOutline,
  CloseOutline, CloudOutline, CloudUploadOutline, CommentOutline, CompassOutline, ControlOutline, DashboardOutline,
  DatabaseOutline, DeleteOutline, DiffOutline, DownOutline, DownloadOutline, EditOutline, EnvironmentFill,
  EnvironmentOutline, ExclamationCircleOutline, ExperimentOutline, EyeInvisibleOutline, EyeOutline, FieldTimeOutline,
  FileDoneOutline, FileExcelOutline, FilePdfOutline, FileSearchOutline, FileTextOutline, FilterOutline,
  FundProjectionScreenOutline, GlobalOutline, HistoryOutline, HolderOutline, InboxOutline, InfoCircleOutline,
  KeyOutline, LeftOutline, LinkOutline, LoadingOutline, LockOutline, LogoutOutline, MailOutline, MenuOutline,
  MessageOutline, MinusOutline, MoreOutline, OrderedListOutline, PauseCircleOutline, PhoneOutline, PictureOutline,
  PlayCircleOutline, PlusCircleOutline, PlusOutline, ProfileOutline, QuestionCircleOutline, RadarChartOutline,
  RedoOutline, ReloadOutline, RightOutline, SafetyCertificateOutline, SaveOutline, SearchOutline, SendOutline,
  SettingOutline, SlidersOutline, StopOutline, SwapOutline, SyncOutline, TagOutline, TeamOutline,
  ThunderboltFill, ThunderboltOutline, ToolOutline, UnorderedListOutline, UploadOutline, UsbOutline, UsergroupAddOutline,
  UserOutline, VideoCameraOutline, WarningOutline, ZoomInOutline, ZoomOutOutline,
} from '@ant-design/icons-angular/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { timezone: '+0700', dateFormat: 'dd/MM/yyyy HH:mm' },
    },
    provideNzIcons([
      AimOutline, AlertOutline, AppstoreOutline, ArrowDownOutline, ArrowLeftOutline, ArrowRightOutline, ArrowUpOutline,
      AuditOutline, BankOutline, BellOutline, BorderOutline, BranchesOutline, CalculatorOutline, CalendarOutline,
      CheckCircleOutline, CheckOutline, CheckSquareOutline, ClearOutline, ClockCircleOutline, CloseCircleOutline,
      CloseOutline, CloudOutline, CloudUploadOutline, CommentOutline, CompassOutline, ControlOutline, DashboardOutline,
      DatabaseOutline, DeleteOutline, DiffOutline, DownOutline, DownloadOutline, EditOutline, EnvironmentFill,
      EnvironmentOutline, ExclamationCircleOutline, ExperimentOutline, EyeInvisibleOutline, EyeOutline, FieldTimeOutline,
      FileDoneOutline, FileExcelOutline, FilePdfOutline, FileSearchOutline, FileTextOutline, FilterOutline,
      FundProjectionScreenOutline, GlobalOutline, HistoryOutline, HolderOutline, InboxOutline, InfoCircleOutline,
      KeyOutline, LeftOutline, LinkOutline, LoadingOutline, LockOutline, LogoutOutline, MailOutline, MenuOutline,
      MessageOutline, MinusOutline, MoreOutline, OrderedListOutline, PauseCircleOutline, PhoneOutline, PictureOutline,
      PlayCircleOutline, PlusCircleOutline, PlusOutline, ProfileOutline, QuestionCircleOutline, RadarChartOutline,
      RedoOutline, ReloadOutline, RightOutline, SafetyCertificateOutline, SaveOutline, SearchOutline, SendOutline,
      SettingOutline, SlidersOutline, StopOutline, SwapOutline, SyncOutline, TagOutline, TeamOutline,
      ThunderboltFill, ThunderboltOutline, ToolOutline, UnorderedListOutline, UploadOutline, UsbOutline, UsergroupAddOutline,
      UserOutline, VideoCameraOutline, WarningOutline, ZoomInOutline, ZoomOutOutline,
    ]),
  ],
};
