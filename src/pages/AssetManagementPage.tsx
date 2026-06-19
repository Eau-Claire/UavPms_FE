import { Button, Input, Table } from 'antd';
import {
  DownOutlined,
  EnvironmentFilled,
  ExclamationCircleFilled,
  SearchOutlined,
  ThunderboltFilled,
  WarningFilled,
} from '@ant-design/icons';

const towerRows = [
  { key: 'T01', code: 'T01', status: 'Tốt', tone: 'normal', devices: 14, alerts: 0 },
  { key: 'T02', code: 'T02', status: 'Cảnh báo', tone: 'warning', devices: 12, alerts: 1 },
  { key: 'T03', code: 'T03', status: 'Lỗi', tone: 'critical', devices: 15, alerts: 2 },
  { key: 'T04', code: 'T04', status: 'Khẩn cấp', tone: 'critical', devices: 12, alerts: 3 },
];

const towerColumns = [
  { title: 'MÃ CỘT', dataIndex: 'code', key: 'code' },
  {
    title: 'TÌNH TRẠNG',
    dataIndex: 'status',
    key: 'status',
    render: (status: string, record: (typeof towerRows)[number]) => (
      <span className={`asset-status asset-status-${record.tone}`}>{status}</span>
    ),
  },
  { title: 'SỐ THIẾT BỊ', dataIndex: 'devices', key: 'devices' },
  {
    title: 'CẢNH BÁO',
    dataIndex: 'alerts',
    key: 'alerts',
    render: (alerts: number, record: (typeof towerRows)[number]) => (
      <span className={`asset-alert asset-alert-${record.tone}`}>
        {alerts > 1 ? <ExclamationCircleFilled /> : alerts === 1 ? <WarningFilled /> : null}
        {alerts}
      </span>
    ),
  },
  {
    title: 'HÀNH ĐỘNG',
    key: 'action',
    render: (_: unknown, record: (typeof towerRows)[number]) => (
      <Button type={record.code === 'T04' ? 'primary' : 'text'} className="asset-table-action">
        Xem chi tiết
      </Button>
    ),
  },
];

const AssetManagementPage = () => (
  <div className="asset-page">
    <div className="asset-workspace">
      <aside className="asset-tree-panel">
        <h1>Asset Management</h1>
        <Input prefix={<SearchOutlined />} placeholder="Lọc thiết bị..." className="asset-filter" />

        <div className="asset-tree">
          <div className="asset-tree-group">
            <DownOutlined />
            <span>Miền Nam</span>
          </div>
          <div className="asset-tree-subgroup">
            <DownOutlined />
            <span>TBA Tân Bình (110kV)</span>
          </div>
          <div className="asset-tree-item asset-tree-item-active">
            <ThunderboltFilled />
            <span>ĐD Tân Bình - Hóc Môn</span>
            <i />
          </div>
          {['Cột T01', 'Cột T02', 'Cột T03', 'Cột T04'].map((tower, index) => (
            <div
              key={tower}
              className={tower === 'Cột T04' ? 'asset-tree-tower asset-tree-tower-active' : 'asset-tree-tower'}
            >
              <EnvironmentFilled />
              <span>{tower}</span>
              {index > 1 && <i />}
            </div>
          ))}
          <div className="asset-tree-group asset-tree-group-muted">
            <DownOutlined rotate={-90} />
            <span>Miền Trung</span>
          </div>
        </div>
      </aside>

      <main className="asset-main-panel">
        <div className="asset-tabs-row">
          <div className="asset-tabs">
            <button type="button">Overview</button>
            <button type="button" className="asset-tab-active">Map View</button>
            <button type="button">Grid View</button>
          </div>
          <div className="asset-view-toggle">
            <button type="button">Danh sách</button>
            <button type="button" className="asset-view-active">Bản đồ</button>
          </div>
        </div>

        <section className="asset-map">
          <div className="map-grid-lines" />
          <svg viewBox="0 0 900 420" className="map-route" aria-hidden="true">
            <path
              d="M88 300 C170 210 270 210 340 250 S500 350 598 238 S740 100 820 168"
              fill="none"
              stroke="#2ddf91"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M88 300 C170 210 270 210 340 250 S500 350 598 238 S740 100 820 168"
              fill="none"
              stroke="rgba(45, 223, 145, 0.22)"
              strokeWidth="22"
              strokeLinecap="round"
            />
          </svg>
          <span className="map-marker map-marker-ok marker-t01">T01</span>
          <span className="map-marker map-marker-warning marker-t02">T02</span>
          <span className="map-marker map-marker-critical marker-t03">T03</span>
          <span className="map-marker map-marker-critical marker-t04">T04</span>
          <div className="map-tooltip">
            <strong>Cột T04</strong>
            <span>Sức khỏe:</span>
            <small>Số thiết bị:</small>
            <button type="button">Xem chi tiết</button>
          </div>
          <div className="map-legend">
            <strong>CHÚ GIẢI TÌNH TRẠNG</strong>
            <span><i className="legend-ok" />Tốt (&gt;= 80)</span>
            <span><i className="legend-warning" />Cảnh báo (50-79)</span>
            <span><i className="legend-critical" />Nguy hiểm (&lt; 50)</span>
            <span><i className="legend-pulse" />Cảnh báo khẩn cấp</span>
          </div>
        </section>

        <section className="asset-table-shell">
          <Table
            columns={towerColumns}
            dataSource={towerRows}
            pagination={false}
            rowClassName={(record) => (record.code === 'T04' ? 'asset-row-active' : '')}
            className="evn-table asset-table"
          />
        </section>
      </main>
    </div>
  </div>
);

export default AssetManagementPage;
