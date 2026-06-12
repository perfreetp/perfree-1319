import { getDb } from './index';
import { initSchema } from './schema';

const seed = () => {
  initSchema();
  const db = getDb();

  const zoneNames = ['东城区', '西城区', '南城区', '北城区', '中心城区'];
  const zones: { id: number; name: string }[] = [];

  const zoneStmt = db.prepare('INSERT INTO zones (name, description) VALUES (?, ?)');
  zoneNames.forEach((name) => {
    const info = zoneStmt.run(name, `${name}供水区域`);
    zones.push({ id: info.lastInsertRowid as number, name });
  });

  const communityStmt = db.prepare('INSERT INTO communities (name, zone_id, population, households) VALUES (?, ?, ?, ?)');
  zones.forEach(zone => {
    for (let i = 1; i <= 3; i++) {
      communityStmt.run(
        `${zone.name}第${i}小区`,
        zone.id,
        5000 + Math.floor(Math.random() * 10000),
        1000 + Math.floor(Math.random() * 2000)
      );
    }
  });

  const valveStmt = db.prepare('INSERT INTO valves (code, name, zone_id, location) VALUES (?, ?, ?, ?)');
  zones.forEach(zone => {
    for (let i = 1; i <= 5; i++) {
      valveStmt.run(
        `V-${zone.name.charAt(0)}-${String(i).padStart(3, '0')}`,
        `${zone.name}${i}号阀门`,
        zone.id,
        `${zone.name}主干道${i}号路口`
      );
    }
  });

  const monitorStmt = db.prepare('INSERT INTO zone_monitors (zone_id, flow_rate, pressure, timestamp) VALUES (?, ?, ?, ?)');
  const now = Date.now();
  zones.forEach(zone => {
    for (let i = 0; i < 24; i++) {
      const timestamp = new Date(now - (23 - i) * 3600 * 1000).toISOString();
      monitorStmt.run(
        zone.id,
        100 + Math.random() * 50,
        0.3 + Math.random() * 0.2,
        timestamp
      );
    }
  });

  const stationStmt = db.prepare('INSERT INTO pump_stations (name, location, capacity) VALUES (?, ?, ?)');
  const stations = [
    { name: '城东泵站', location: '东城区', capacity: 5000 },
    { name: '城西泵站', location: '西城区', capacity: 4500 },
    { name: '中心泵站', location: '中心城区', capacity: 8000 }
  ];
  const stationIds: number[] = [];
  stations.forEach(s => {
    const info = stationStmt.run(s.name, s.location, s.capacity);
    stationIds.push(info.lastInsertRowid as number);
  });

  const pumpStmt = db.prepare('INSERT INTO pump_groups (station_id, name, status, current_flow, power, efficiency) VALUES (?, ?, ?, ?, ?, ?)');
  const pumpStatuses = ['running', 'standby', 'maintenance'];
  stationIds.forEach(stationId => {
    for (let i = 1; i <= 3; i++) {
      const status = pumpStatuses[i - 1];
      pumpStmt.run(
        stationId,
        `${i}号泵组`,
        status,
        status === 'running' ? 300 + Math.random() * 200 : 0,
        status === 'running' ? 150 + Math.random() * 100 : 0,
        0.85 + Math.random() * 0.1
      );
    }
  });

  const eventStmt = db.prepare(`
    INSERT INTO pipe_events (event_type, severity, location, description, status, reported_by, zone_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const events = [
    {
      event_type: 'pipe_break',
      severity: 'high',
      location: '东城区主干道',
      description: 'DN800主管道爆裂，漏水严重',
      status: 'processing',
      reported_by: '巡检员张三',
      zone_id: 1
    },
    {
      event_type: 'water_outage',
      severity: 'medium',
      location: '西城区维修段',
      description: '计划性停水维修',
      status: 'scheduled',
      reported_by: '调度中心',
      zone_id: 2
    }
  ];
  const eventIds: number[] = [];
  events.forEach(e => {
    const info = eventStmt.run(
      e.event_type,
      e.severity,
      e.location,
      e.description,
      e.status,
      e.reported_by,
      e.zone_id
    );
    eventIds.push(info.lastInsertRowid as number);
  });

  const timelineStmt = db.prepare('INSERT INTO event_timeline (event_id, action, operator, remark) VALUES (?, ?, ?, ?)');
  timelineStmt.run(eventIds[0], '事件上报', '巡检员张三', '发现管道爆裂');
  timelineStmt.run(eventIds[0], '关阀操作', '调度员李四', '已关闭相关阀门');

  const affectedStmt = db.prepare('INSERT INTO affected_communities (event_id, community_id) VALUES (?, ?)');
  affectedStmt.run(eventIds[0], 1);
  affectedStmt.run(eventIds[0], 2);

  const valveOpStmt = db.prepare(`
    INSERT INTO valve_operations (event_id, valve_id, operation, recommended_order, status)
    VALUES (?, ?, ?, ?, ?)`);
  valveOpStmt.run(eventIds[0], 1, 'close', 1, 'completed');
  valveOpStmt.run(eventIds[0], 2, 'close', 2, 'completed');

  const forecastStmt = db.prepare(`
    INSERT INTO water_forecasts (zone_id, forecast_date, hour, forecast_flow, peak_flow)
    VALUES (?, ?, ?, ?, ?)`);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  zones.forEach(zone => {
    for (let h = 0; h < 24; h++) {
      const baseFlow = 100 + Math.sin((h - 6) * Math.PI / 12) * 50 + 50;
      const isPeak = (h >= 7 && h <= 9) || (h >= 18 && h <= 20);
      forecastStmt.run(
        zone.id,
        dateStr,
        h,
        baseFlow + (isPeak ? 30 : 0),
        isPeak ? baseFlow + 50 : null
      );
    }
  });

  const suggestionStmt = db.prepare(`
    INSERT INTO dispatch_suggestions (suggestion_type, content, priority)
    VALUES (?, ?, ?)`);
  suggestionStmt.run(
    'pump_adjust',
    '预计明早8点用水高峰，建议启动中心泵站2号泵组',
    'high'
  );
  suggestionStmt.run(
    'pressure_adjust',
    '东城区压力偏低，建议调整调压阀',
    'medium'
  );

  const notificationStmt = db.prepare(`
    INSERT INTO notifications (notification_type, title, content, event_id, target_audience)
    VALUES (?, ?, ?, ?, ?)`);
  notificationStmt.run(
    'water_outage',
    '东城区停水通知',
    '因管道维修，东城区部分区域将于今日14:00-18:00停水',
    eventIds[0],
    '东城区用户'
  );

  const callStmt = db.prepare(`
    INSERT INTO customer_calls (caller_phone, call_type, tags, event_id, operator, description)
    VALUES (?, ?, ?, ?, ?, ?)`);
  callStmt.run(
    '13800138000',
    'complaint',
    '停水,水质',
    eventIds[0],
    '客服小王',
    '反映家中停水，询问来水时间'
  );

  const shiftStmt = db.prepare(`
    INSERT INTO shift_records (shift_type, operator, start_time, handover_summary)
    VALUES (?, ?, ?, ?)`);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  shiftStmt.run(
    'day',
    '张三',
    yesterday.toISOString(),
    '白班交接：处理爆管事件1起，运行正常'
  );

  console.log('数据初始化完成');
};

if (require.main === module) {
  seed();
}

export { seed };
