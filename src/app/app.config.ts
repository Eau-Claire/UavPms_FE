import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  AimOutline, AlertFill, AlertOutline, AppstoreFill, AppstoreOutline, ArrowDownOutline,
  ArrowLeftOutline, ArrowRightOutline, ArrowUpOutline, AuditOutline, BankOutline,
  BellFill, BellOutline, BorderOutline, BranchesOutline, CalculatorOutline, CalendarFill,
  CalendarOutline, CheckCircleFill, CheckCircleOutline, CheckOutline, CheckSquareFill,
  CheckSquareOutline, ClearOutline, ClockCircleFill, ClockCircleOutline, CloseCircleFill,
  CloseCircleOutline, CloseOutline, CloudDownloadOutline, CloudOutline, CloudUploadOutline,
  CodeOutline, CommentOutline, CompassFill, CompassOutline, ControlOutline, DashboardFill,
  DashboardOutline, DatabaseOutline, DeleteOutline, DiffOutline, DisconnectOutline,
  DownOutline, DownloadOutline, EditFill, EditOutline, EnvironmentFill, EnvironmentOutline,
  ExclamationCircleFill, ExclamationCircleOutline, ExperimentFill, ExperimentOutline,
  EyeFill, EyeInvisibleOutline, EyeOutline, FieldTimeOutline, FileDoneOutline, FileExcelOutline,
  FilePdfOutline, FileSearchOutline, FileTextFill, FileTextOutline, FilterOutline,
  FundProjectionScreenOutline, GlobalOutline, HistoryOutline, HolderOutline, InboxOutline,
  InfoCircleFill, InfoCircleOutline, KeyOutline, LeftOutline, LinkOutline, LoadingOutline,
  LockFill, LockOutline, LogoutOutline, MailOutline, MenuOutline, MessageFill, MessageOutline,
  MinusOutline, MoreOutline, OrderedListOutline, PauseCircleFill, PauseCircleOutline,
  PhoneOutline, PictureOutline, PlayCircleFill, PlayCircleOutline, PlusCircleOutline,
  PlusOutline, ProfileOutline, QuestionCircleOutline, RadarChartOutline, RedoOutline,
  ReloadOutline, RightOutline, SafetyCertificateFill, SafetyCertificateOutline, SaveOutline,
  ScheduleOutline, SearchOutline, SendOutline, SettingOutline, StopFill, StopOutline,
  SwapOutline, SyncOutline, TagOutline, TeamOutline, ThunderboltFill, ThunderboltOutline,
  ToolOutline, UnlockOutline, UnorderedListOutline, UploadOutline, UsbOutline, UserOutline,
  UsergroupAddOutline, VideoCameraOutline, WarningFill, WarningOutline, ZoomInOutline, ZoomOutOutline,
} from '@ant-design/icons-angular/icons';

const ICONS = [
  AimOutline, AlertFill, AlertOutline, AppstoreFill, AppstoreOutline, ArrowDownOutline,
  ArrowLeftOutline, ArrowRightOutline, ArrowUpOutline, AuditOutline, BankOutline,
  BellFill, BellOutline, BorderOutline, BranchesOutline, CalculatorOutline, CalendarFill,
  CalendarOutline, CheckCircleFill, CheckCircleOutline, CheckOutline, CheckSquareFill,
  CheckSquareOutline, ClearOutline, ClockCircleFill, ClockCircleOutline, CloseCircleFill,
  CloseCircleOutline, CloseOutline, CloudDownloadOutline, CloudOutline, CloudUploadOutline,
  CodeOutline, CommentOutline, CompassFill, CompassOutline, ControlOutline, DashboardFill,
  DashboardOutline, DatabaseOutline, DeleteOutline, DiffOutline, DisconnectOutline,
  DownOutline, DownloadOutline, EditFill, EditOutline, EnvironmentFill, EnvironmentOutline,
  ExclamationCircleFill, ExclamationCircleOutline, ExperimentFill, ExperimentOutline,
  EyeFill, EyeInvisibleOutline, EyeOutline, FieldTimeOutline, FileDoneOutline, FileExcelOutline,
  FilePdfOutline, FileSearchOutline, FileTextFill, FileTextOutline, FilterOutline,
  FundProjectionScreenOutline, GlobalOutline, HistoryOutline, HolderOutline, InboxOutline,
  InfoCircleFill, InfoCircleOutline, KeyOutline, LeftOutline, LinkOutline, LoadingOutline,
  LockFill, LockOutline, LogoutOutline, MailOutline, MenuOutline, MessageFill, MessageOutline,
  MinusOutline, MoreOutline, OrderedListOutline, PauseCircleFill, PauseCircleOutline,
  PhoneOutline, PictureOutline, PlayCircleFill, PlayCircleOutline, PlusCircleOutline,
  PlusOutline, ProfileOutline, QuestionCircleOutline, RadarChartOutline, RedoOutline,
  ReloadOutline, RightOutline, SafetyCertificateFill, SafetyCertificateOutline, SaveOutline,
  ScheduleOutline, SearchOutline, SendOutline, SettingOutline, StopFill, StopOutline,
  SwapOutline, SyncOutline, TagOutline, TeamOutline, ThunderboltFill, ThunderboltOutline,
  ToolOutline, UnlockOutline, UnorderedListOutline, UploadOutline, UsbOutline, UserOutline,
  UsergroupAddOutline, VideoCameraOutline, WarningFill, WarningOutline, ZoomInOutline, ZoomOutOutline,
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideNzIcons(ICONS),
  ],
};
