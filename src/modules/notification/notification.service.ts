import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export type NotificationType = 'water_outage' | 'leak_alert' | 'maintenance' | 'emergency';
export type NotificationStatus = 'draft' | 'sent' | 'cancelled';

export type NotificationData = {
  notification_type: NotificationType;
  title: string;
  content: string;
  event_id?: number;
  target_audience?: string;
};

export type Notification = {
  id: number;
  notification_type: NotificationType;
  title: string;
  content: string;
  event_id: number | null;
  target_audience: string | null;
  sent_at: string | null;
  created_at: string;
  event_location?: string;
  event_severity?: string;
};

type PipeEvent = {
  id: number;
  event_type: string;
  severity: string;
  location: string;
  description: string | null;
  status: string;
  zone_id: number | null;
  repair_duration: number | null;
  created_at: string;
  zone_name?: string;
};

type AffectedCommunity = {
  id: number;
  community_name: string;
  community_id: number;
  population: number | null;
  households: number | null;
};

const getEventDetail = (eventId: number): PipeEvent => {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT pe.*, z.name as zone_name
    FROM pipe_events pe
    LEFT JOIN zones z ON pe.zone_id = z.id
    WHERE pe.id = ?
  `);
  const event = stmt.get(eventId) as PipeEvent;
  if (!event) {
    throw createError(404, `事件 ${eventId} 不存在`);
  }
  return event;
};

const getAffectedCommunities = (eventId: number): AffectedCommunity[] => {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT ac.*, c.name as community_name, c.population, c.households
    FROM affected_communities ac
    LEFT JOIN communities c ON ac.community_id = c.id
    WHERE ac.event_id = ?
    ORDER BY c.name
  `);
  return stmt.all(eventId) as AffectedCommunity[];
};

const generateTargetAudience = (eventId: number): string => {
  const communities = getAffectedCommunities(eventId);
  if (communities.length === 0) {
    return '全体用户';
  }
  const communityNames = communities.map(c => c.community_name).join('、');
  const totalHouseholds = communities.reduce((sum, c) => sum + (c.households || 0), 0);
  const totalPopulation = communities.reduce((sum, c) => sum + (c.population || 0), 0);
  return `受影响区域: ${communityNames}，共 ${communities.length} 个小区，${totalHouseholds} 户，${totalPopulation} 人`;
};

export const generateWaterOutageNotification = (eventId: number): {
  title: string;
  content: string;
  target_audience: string;
} => {
  const event = getEventDetail(eventId);

  const location = event.zone_name ? `${event.zone_name} - ${event.location}` : event.location;
  const estimatedRestoreTime = event.repair_duration
    ? new Date(Date.now() + event.repair_duration * 60 * 60 * 1000).toLocaleString('zh-CN')
    : '待定';

  const severityText: Record<string, string> = {
    low: '轻度',
    medium: '中度',
    high: '严重',
    critical: '紧急'
  };

  const title = `【停水通知】${location} 供水临时中断`;

  const content = `尊敬的用户：

您好！由于供水管道${event.event_type === 'burst' ? '爆管' : '故障'}，${location} 区域目前供水受到影响。

【事件详情】
• 事件类型：${event.event_type === 'burst' ? '管道爆管' : '停水事件'}
• 严重程度：${severityText[event.severity] || event.severity}
• 发生位置：${location}
• 预计恢复时间：${estimatedRestoreTime}
${event.description ? `• 事件说明：${event.description}` : ''}

【温馨提示】
1. 请提前做好储水准备
2. 恢复供水后可能出现水质浑浊，请放水片刻后使用
3. 我们将全力抢修，争取尽快恢复供水

给您带来不便，敬请谅解！如有疑问，请拨打供水服务热线。

供水调度中心
${new Date().toLocaleDateString('zh-CN')}`;

  const target_audience = generateTargetAudience(eventId);

  logger.info(`根据事件 ${eventId} 自动生成停水通知`);

  return { title, content, target_audience };
};

export const getNotificationList = (type?: NotificationType, status?: NotificationStatus): Notification[] => {
  const db = getDb();

  let sql = `
    SELECT n.*, pe.location as event_location, pe.severity as event_severity
    FROM notifications n
    LEFT JOIN pipe_events pe ON n.event_id = pe.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (type) {
    sql += ' AND n.notification_type = ?';
    params.push(type);
  }

  if (status === 'draft') {
    sql += ' AND n.sent_at IS NULL';
  } else if (status === 'sent') {
    sql += ' AND n.sent_at IS NOT NULL';
  } else if (status === 'cancelled') {
    sql += " AND n.notification_type = 'cancelled'";
  }

  sql += ' ORDER BY n.created_at DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as Notification[];
};

export const getNotificationDetail = (notificationId: number): Notification => {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT n.*, pe.location as event_location, pe.severity as event_severity
    FROM notifications n
    LEFT JOIN pipe_events pe ON n.event_id = pe.id
    WHERE n.id = ?
  `);
  const notification = stmt.get(notificationId) as Notification;

  if (!notification) {
    throw createError(404, `通知 ${notificationId} 不存在`);
  }

  return notification;
};

export const createNotification = (notificationData: NotificationData): number => {
  const db = getDb();

  if (notificationData.event_id) {
    getEventDetail(notificationData.event_id);
  }

  const stmt = db.prepare(`
    INSERT INTO notifications (notification_type, title, content, event_id, target_audience)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    notificationData.notification_type,
    notificationData.title,
    notificationData.content,
    notificationData.event_id || null,
    notificationData.target_audience || null
  );

  const notificationId = result.lastInsertRowid as number;

  logger.info(`通知创建成功，通知ID: ${notificationId}，类型: ${notificationData.notification_type}`);

  return notificationId;
};

export const sendNotification = (notificationId: number): { success: boolean; sent_at: string } => {
  const db = getDb();

  const notification = getNotificationDetail(notificationId);

  if (notification.sent_at) {
    throw createError(400, `通知 ${notificationId} 已发送，请勿重复操作`);
  }

  const sentAt = new Date().toISOString();

  db.prepare(`
    UPDATE notifications SET sent_at = ? WHERE id = ?
  `).run(sentAt, notificationId);

  logger.info(`通知 ${notificationId} 已标记为已发送，模拟推送完成`);

  return {
    success: true,
    sent_at: sentAt
  };
};

export const getEventNotifications = (eventId: number): Notification[] => {
  const db = getDb();

  getEventDetail(eventId);

  const stmt = db.prepare(`
    SELECT n.*, pe.location as event_location, pe.severity as event_severity
    FROM notifications n
    LEFT JOIN pipe_events pe ON n.event_id = pe.id
    WHERE n.event_id = ?
    ORDER BY n.created_at DESC
  `);

  return stmt.all(eventId) as Notification[];
};
