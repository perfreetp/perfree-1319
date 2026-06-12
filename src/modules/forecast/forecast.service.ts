import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';
import { suggestionStatusEnum, suggestionPriorityEnum } from './forecast.validation';

type SuggestionStatus = typeof suggestionStatusEnum[number];
type SuggestionPriority = typeof suggestionPriorityEnum[number];

interface WaterForecast {
  id: number;
  zone_id: number;
  forecast_date: string;
  hour: number;
  forecast_flow: number;
  peak_flow: number | null;
  confidence: number;
  created_at: string;
}

interface DispatchSuggestion {
  id: number;
  suggestion_type: string;
  content: string;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  created_at: string;
}

interface PeakForecast {
  morning_peak: {
    start_hour: number;
    end_hour: number;
    max_flow: number;
    avg_flow: number;
  };
  evening_peak: {
    start_hour: number;
    end_hour: number;
    max_flow: number;
    avg_flow: number;
  };
  threshold_exceeded: boolean;
  threshold: number;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface ForecastOverview {
  zone_id: number;
  zone_name: string;
  confidence: number;
  today: {
    avg_flow: number;
    peak_flow: number;
    peak_hour: number;
    risk_level: RiskLevel;
    risk_score: number;
    suggestion: string;
  };
  tomorrow: {
    date: string;
    avg_flow: number;
    peak_flow: number;
    peak_hour: number;
    risk_level: RiskLevel;
    risk_score: number;
    suggestion: string;
  };
  week_summary: {
    start_date: string;
    end_date: string;
    daily_max_flow: number;
    daily_avg_flow: number;
    highest_risk_level: RiskLevel;
    days_high_risk: number;
    days_medium_risk: number;
    days_low_risk: number;
  };
  risk_trend: {
    dates: string[];
    risk_scores: number[];
    peak_flows: number[];
  };
}

const PEAK_LOW = 120;
const PEAK_MEDIUM = 150;
const PEAK_HIGH = 180;

const computeRisk = (peakFlow: number): { level: RiskLevel; score: number; suggestion: string } => {
  if (peakFlow >= PEAK_HIGH) {
    return {
      level: 'critical',
      score: 100,
      suggestion: `峰值 ${peakFlow} m³/h 达到高危阈值，建议立即启动全部备用泵组并通知值班经理`
    };
  } else if (peakFlow >= PEAK_MEDIUM) {
    return {
      level: 'high',
      score: 75,
      suggestion: `峰值 ${peakFlow} m³/h 较高，建议于早高峰前启动 1-2 台备用泵`
    };
  } else if (peakFlow >= PEAK_LOW) {
    return {
      level: 'medium',
      score: 50,
      suggestion: `峰值 ${peakFlow} m³/h，建议关注压力变化并准备备用方案`
    };
  } else {
    return {
      level: 'low',
      score: 25,
      suggestion: `峰值 ${peakFlow} m³/h，供水充足，维持现有方案即可`
    };
  }
};

const summarizeDate = (zoneId: number, dateStr: string): {
  avg_flow: number;
  peak_flow: number;
  peak_hour: number;
  risk_level: RiskLevel;
  risk_score: number;
  suggestion: string;
} => {
  const db = getDb();
  const existing = db.prepare(`
    SELECT hour, forecast_flow FROM water_forecasts
    WHERE zone_id = ? AND forecast_date = ? ORDER BY hour
  `).all(zoneId, dateStr) as { hour: number; forecast_flow: number }[];

  let hourly: number[];
  if (existing.length === 24) {
    hourly = existing.map(h => h.forecast_flow);
  } else {
    hourly = [];
    for (let h = 0; h < 24; h++) hourly.push(generateForecastFlow(h));
  }

  const avg = hourly.reduce((a, b) => a + b, 0) / hourly.length;
  const peak = Math.max(...hourly);
  const peakHour = hourly.indexOf(peak);
  const risk = computeRisk(peak);

  return {
    avg_flow: Math.round(avg * 100) / 100,
    peak_flow: Math.round(peak * 100) / 100,
    peak_hour: peakHour >= 0 ? peakHour : 0,
    risk_level: risk.level,
    risk_score: risk.score,
    suggestion: risk.suggestion
  };
};

interface GeneratedSuggestion {
  suggestionId: number;
}

const MORNING_PEAK_START = 7;
const MORNING_PEAK_END = 9;
const EVENING_PEAK_START = 18;
const EVENING_PEAK_END = 20;
const PEAK_FLOW_THRESHOLD = 150;
const LOW_PRESSURE_THRESHOLD = 0.2;

const generateForecastFlow = (hour: number, baseFlow: number = 100, holidayFactor: number = 1.0, weatherFactor: number = 1.0): number => {
  const normalizedHour = (hour - 6) / 12;
  const base = Math.sin(normalizedHour * Math.PI) * 0.5 + 0.5;

  let flow = baseFlow + base * 50;

  if (hour >= MORNING_PEAK_START && hour <= MORNING_PEAK_END) {
    const peakFactor = Math.sin(((hour - MORNING_PEAK_START) / (MORNING_PEAK_END - MORNING_PEAK_START + 1)) * Math.PI);
    flow += peakFactor * 40;
  }

  if (hour >= EVENING_PEAK_START && hour <= EVENING_PEAK_END) {
    const peakFactor = Math.sin(((hour - EVENING_PEAK_START) / (EVENING_PEAK_END - EVENING_PEAK_START + 1)) * Math.PI);
    flow += peakFactor * 50;
  }

  flow = flow * holidayFactor * weatherFactor;

  return Math.round(flow * 100) / 100;
};

const ensureZoneExists = (zoneId: number): void => {
  const db = getDb();
  const zoneStmt = db.prepare('SELECT id FROM zones WHERE id = ?');
  const zone = zoneStmt.get(zoneId);
  if (!zone) {
    throw createError(404, '分区不存在');
  }
};

export const getZoneForecast = (zoneId: number, date?: string, holidayFactor?: number, weatherFactor?: number): WaterForecast[] => {
  const db = getDb();
  ensureZoneExists(zoneId);

  const forecastDate = date || new Date().toISOString().split('T')[0];
  const hf = holidayFactor ?? 1.0;
  const wf = weatherFactor ?? 1.0;

  const existingStmt = db.prepare(`
    SELECT * FROM water_forecasts
    WHERE zone_id = ? AND forecast_date = ?
    ORDER BY hour
  `);
  const existingForecasts = existingStmt.all(zoneId, forecastDate) as WaterForecast[];

  if (existingForecasts.length === 24 && hf === 1.0 && wf === 1.0) {
    return existingForecasts;
  }

  const transaction = db.transaction(() => {
    const deleteStmt = db.prepare(`
      DELETE FROM water_forecasts WHERE zone_id = ? AND forecast_date = ?
    `);
    deleteStmt.run(zoneId, forecastDate);

    const insertStmt = db.prepare(`
      INSERT INTO water_forecasts (zone_id, forecast_date, hour, forecast_flow, peak_flow, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const forecasts: WaterForecast[] = [];
    const confidence = Math.round((0.9 / (hf * wf)) * 100) / 100;

    for (let hour = 0; hour < 24; hour++) {
      const forecastFlow = generateForecastFlow(hour, 100, hf, wf);
      const isPeakHour = (hour >= MORNING_PEAK_START && hour <= MORNING_PEAK_END) ||
                         (hour >= EVENING_PEAK_START && hour <= EVENING_PEAK_END);
      const peakFlow = isPeakHour ? Math.round(forecastFlow * 1.1 * 100) / 100 : null;

      const result = insertStmt.run(zoneId, forecastDate, hour, forecastFlow, peakFlow, confidence);

      forecasts.push({
        id: result.lastInsertRowid as number,
        zone_id: zoneId,
        forecast_date: forecastDate,
        hour,
        forecast_flow: forecastFlow,
        peak_flow: peakFlow,
        confidence,
        created_at: new Date().toISOString()
      });
    }

    return forecasts;
  });

  return transaction();
};

export const getZonePeakForecast = (zoneId: number, date?: string): PeakForecast => {
  const db = getDb();
  ensureZoneExists(zoneId);

  const forecasts = getZoneForecast(zoneId, date);

  const morningFlows = forecasts
    .filter(f => f.hour >= MORNING_PEAK_START && f.hour <= MORNING_PEAK_END)
    .map(f => f.forecast_flow);

  const eveningFlows = forecasts
    .filter(f => f.hour >= EVENING_PEAK_START && f.hour <= EVENING_PEAK_END)
    .map(f => f.forecast_flow);

  const morningMax = Math.max(...morningFlows);
  const morningAvg = morningFlows.reduce((a, b) => a + b, 0) / morningFlows.length;
  const eveningMax = Math.max(...eveningFlows);
  const eveningAvg = eveningFlows.reduce((a, b) => a + b, 0) / eveningFlows.length;

  const overallMax = Math.max(morningMax, eveningMax);

  return {
    morning_peak: {
      start_hour: MORNING_PEAK_START,
      end_hour: MORNING_PEAK_END,
      max_flow: Math.round(morningMax * 100) / 100,
      avg_flow: Math.round(morningAvg * 100) / 100
    },
    evening_peak: {
      start_hour: EVENING_PEAK_START,
      end_hour: EVENING_PEAK_END,
      max_flow: Math.round(eveningMax * 100) / 100,
      avg_flow: Math.round(eveningAvg * 100) / 100
    },
    threshold_exceeded: overallMax > PEAK_FLOW_THRESHOLD,
    threshold: PEAK_FLOW_THRESHOLD
  };
};

export const getAllForecastOverview = (): ForecastOverview[] => {
  const db = getDb();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const weekDates: string[] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    weekDates.push(date.toISOString().split('T')[0]);
  }

  const zonesStmt = db.prepare('SELECT id, name FROM zones ORDER BY id');
  const zones = zonesStmt.all() as { id: number; name: string }[];

  if (zones.length === 0) {
    return [];
  }

  const overviews: ForecastOverview[] = [];

  for (const zone of zones) {
    const todaySum = summarizeDate(zone.id, todayStr);
    const tomorrowSum = summarizeDate(zone.id, tomorrowStr);

    const weekDaily: {
      date: string;
      peak_flow: number;
      avg_flow: number;
      risk_level: RiskLevel;
      risk_score: number;
    }[] = [];

    for (const d of weekDates) {
      const s = summarizeDate(zone.id, d);
      weekDaily.push({
        date: d,
        peak_flow: s.peak_flow,
        avg_flow: s.avg_flow,
        risk_level: s.risk_level,
        risk_score: s.risk_score
      });
    }

    const weekMaxFlow = Math.max(...weekDaily.map(w => w.peak_flow));
    const weekAvgFlow = weekDaily.reduce((a, b) => a + b.avg_flow, 0) / weekDaily.length;
    const highestRisk = weekDaily.find(w => w.peak_flow === weekMaxFlow)?.risk_level || 'low';
    const daysHigh = weekDaily.filter(w => w.risk_level === 'high' || w.risk_level === 'critical').length;
    const daysMedium = weekDaily.filter(w => w.risk_level === 'medium').length;
    const daysLow = weekDaily.filter(w => w.risk_level === 'low').length;

    const confidence = 0.9;

    overviews.push({
      zone_id: zone.id,
      zone_name: zone.name,
      confidence,
      today: todaySum,
      tomorrow: {
        date: tomorrowStr,
        ...tomorrowSum
      },
      week_summary: {
        start_date: weekDates[0],
        end_date: weekDates[weekDates.length - 1],
        daily_max_flow: Math.round(weekMaxFlow * 100) / 100,
        daily_avg_flow: Math.round(weekAvgFlow * 100) / 100,
        highest_risk_level: highestRisk,
        days_high_risk: daysHigh,
        days_medium_risk: daysMedium,
        days_low_risk: daysLow
      },
      risk_trend: {
        dates: weekDaily.map(w => w.date),
        risk_scores: weekDaily.map(w => w.risk_score),
        peak_flows: weekDaily.map(w => w.peak_flow)
      }
    });
  }

  return overviews;
};

export const getMultiDayForecast = (
  zoneId: number,
  startDate: string,
  endDate: string,
  holidayFactor: number = 1.0,
  weatherFactor: number = 1.0
) => {
  ensureZoneExists(zoneId);

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw createError(400, '起始日期不能晚于截止日期');
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 30) {
    throw createError(400, '预测日期范围不能超过30天');
  }

  const dailyForecasts: {
    date: string;
    hourly: WaterForecast[];
  }[] = [];

  for (let d = 0; d <= diffDays; d++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + d);
    const dateStr = currentDate.toISOString().split('T')[0];

    const hourly = getZoneForecast(zoneId, dateStr, holidayFactor, weatherFactor);

    dailyForecasts.push({
      date: dateStr,
      hourly
    });
  }

  const series: { date: string; hour: number; forecast_flow: number; peak_flow: number | null }[] = [];
  for (const day of dailyForecasts) {
    for (const h of day.hourly) {
      series.push({
        date: day.date,
        hour: h.hour,
        forecast_flow: h.forecast_flow,
        peak_flow: h.peak_flow
      });
    }
  }

  return {
    zone_id: zoneId,
    start_date: startDate,
    end_date: endDate,
    holiday_factor: holidayFactor,
    weather_factor: weatherFactor,
    daily: dailyForecasts,
    series
  };
};

export const getPeakTrend = (
  startDate: string,
  endDate: string,
  holidayFactor: number = 1.0,
  weatherFactor: number = 1.0
) => {
  const db = getDb();

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw createError(400, '起始日期不能晚于截止日期');
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 30) {
    throw createError(400, '预测日期范围不能超过30天');
  }

  const zonesStmt = db.prepare('SELECT id, name FROM zones ORDER BY id');
  const zones = zonesStmt.all() as { id: number; name: string }[];

  const dates: string[] = [];
  for (let d = 0; d <= diffDays; d++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + d);
    dates.push(currentDate.toISOString().split('T')[0]);
  }

  const forecastsByZoneAndDate = new Map<string, { hour: number; forecast_flow: number }[]>();

  for (const zone of zones) {
    for (const dateStr of dates) {
      const key = `${zone.id}-${dateStr}`;
      const existing = db.prepare(`
        SELECT hour, forecast_flow FROM water_forecasts
        WHERE zone_id = ? AND forecast_date = ?
        ORDER BY hour
      `).all(zone.id, dateStr) as { hour: number; forecast_flow: number }[];

      if (existing.length === 24 && holidayFactor === 1.0 && weatherFactor === 1.0) {
        forecastsByZoneAndDate.set(key, existing);
      } else {
        const hourly: { hour: number; forecast_flow: number }[] = [];
        for (let hour = 0; hour < 24; hour++) {
          const flow = generateForecastFlow(hour, 100, holidayFactor, weatherFactor);
          hourly.push({ hour, forecast_flow: flow });
        }
        forecastsByZoneAndDate.set(key, hourly);
      }
    }
  }

  const zoneTrends: {
    zone_id: number;
    zone_name: string;
    daily_peaks: {
      date: string;
      morning_peak_flow: number;
      morning_peak_hour: number;
      evening_peak_flow: number;
      evening_peak_hour: number;
      daily_max_flow: number;
    }[];
  }[] = [];

  for (const zone of zones) {
    const dailyPeaks: {
      date: string;
      morning_peak_flow: number;
      morning_peak_hour: number;
      evening_peak_flow: number;
      evening_peak_hour: number;
      daily_max_flow: number;
    }[] = [];

    for (const dateStr of dates) {
      const key = `${zone.id}-${dateStr}`;
      const forecasts = forecastsByZoneAndDate.get(key) || [];

      const morningFlows = forecasts.filter(f => f.hour >= MORNING_PEAK_START && f.hour <= MORNING_PEAK_END);
      const eveningFlows = forecasts.filter(f => f.hour >= EVENING_PEAK_START && f.hour <= EVENING_PEAK_END);

      const morningPeak = morningFlows.length > 0
        ? morningFlows.reduce((max, f) => f.forecast_flow > max.forecast_flow ? f : max, morningFlows[0])
        : null;
      const eveningPeak = eveningFlows.length > 0
        ? eveningFlows.reduce((max, f) => f.forecast_flow > max.forecast_flow ? f : max, eveningFlows[0])
        : null;

      const allFlows = forecasts.map(f => f.forecast_flow);
      const dailyMax = allFlows.length > 0 ? Math.max(...allFlows) : 0;

      dailyPeaks.push({
        date: dateStr,
        morning_peak_flow: morningPeak ? Math.round(morningPeak.forecast_flow * 100) / 100 : 0,
        morning_peak_hour: morningPeak ? morningPeak.hour : MORNING_PEAK_START,
        evening_peak_flow: eveningPeak ? Math.round(eveningPeak.forecast_flow * 100) / 100 : 0,
        evening_peak_hour: eveningPeak ? eveningPeak.hour : EVENING_PEAK_START,
        daily_max_flow: Math.round(dailyMax * 100) / 100
      });
    }

    zoneTrends.push({
      zone_id: zone.id,
      zone_name: zone.name,
      daily_peaks: dailyPeaks
    });
  }

  const chartData: {
    dates: string[];
    datasets: {
      zone_id: number;
      zone_name: string;
      morning_peak: number[];
      evening_peak: number[];
      daily_max: number[];
    }[];
  } = {
    dates,
    datasets: zoneTrends.map(zt => ({
      zone_id: zt.zone_id,
      zone_name: zt.zone_name,
      morning_peak: zt.daily_peaks.map(d => d.morning_peak_flow),
      evening_peak: zt.daily_peaks.map(d => d.evening_peak_flow),
      daily_max: zt.daily_peaks.map(d => d.daily_max_flow)
    }))
  };

  return {
    start_date: startDate,
    end_date: endDate,
    holiday_factor: holidayFactor,
    weather_factor: weatherFactor,
    zone_trends: zoneTrends,
    chart_data: chartData
  };
};

export const getDispatchSuggestions = (
  status?: SuggestionStatus,
  priority?: SuggestionPriority
): DispatchSuggestion[] => {
  const db = getDb();
  let sql = 'SELECT * FROM dispatch_suggestions';
  const params: (string | number)[] = [];

  if (status || priority) {
    sql += ' WHERE';
    const conditions: string[] = [];

    if (status) {
      conditions.push(' status = ?');
      params.push(status);
    }

    if (priority) {
      if (conditions.length > 0) {
        sql += ' AND';
      }
      conditions.push(' priority = ?');
      params.push(priority);
    }

    sql += conditions.join(' AND');
  }

  sql += ' ORDER BY created_at DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as DispatchSuggestion[];
};

export const generateDispatchSuggestion = (): GeneratedSuggestion => {
  const db = getDb();

  const overviews = getAllForecastOverview();
  const suggestions: { type: string; content: string; priority: SuggestionPriority }[] = [];

  for (const overview of overviews) {
    const today = overview.today;
    const tomorrow = overview.tomorrow;

    if (today.risk_level === 'critical') {
      suggestions.push({
        type: 'peak_warning',
        content: `分区「${overview.zone_name}」今日峰值 ${today.peak_flow} m³/h（${today.peak_hour}:00）达高危阈值，${today.suggestion}`,
        priority: 'critical'
      });
    } else if (today.risk_level === 'high') {
      suggestions.push({
        type: 'peak_warning',
        content: `分区「${overview.zone_name}」今日峰值 ${today.peak_flow} m³/h（${today.peak_hour}:00）较高，${today.suggestion}`,
        priority: 'high'
      });
    }

    if (tomorrow.risk_level === 'critical' || tomorrow.risk_level === 'high') {
      suggestions.push({
        type: 'peak_warning',
        content: `分区「${overview.zone_name}」明日（${tomorrow.date}）预测峰值 ${tomorrow.peak_flow} m³/h，风险等级 ${tomorrow.risk_level}，${tomorrow.suggestion}`,
        priority: tomorrow.risk_level === 'critical' ? 'high' : 'medium'
      });
    }

    const week = overview.week_summary;
    if (week.days_high_risk >= 3) {
      suggestions.push({
        type: 'peak_warning',
        content: `分区「${overview.zone_name}」未来一周有 ${week.days_high_risk} 天高风险，周均流量 ${week.daily_avg_flow} m³/h，建议评估长期增容方案`,
        priority: 'high'
      });
    }
  }

  const monitorStmt = db.prepare(`
    SELECT zm.*, z.name as zone_name
    FROM zone_monitors zm
    LEFT JOIN zones z ON zm.zone_id = z.id
    WHERE zm.timestamp >= datetime('now', '-1 hour')
    ORDER BY zm.timestamp DESC
    LIMIT 100
  `);
  const monitors = monitorStmt.all() as { zone_id: number; zone_name: string; pressure: number }[];

  const lowPressureZones = new Map<number, string>();
  for (const monitor of monitors) {
    if (monitor.pressure < LOW_PRESSURE_THRESHOLD && !lowPressureZones.has(monitor.zone_id)) {
      lowPressureZones.set(monitor.zone_id, monitor.zone_name);
    }
  }

  for (const [zoneId, zoneName] of lowPressureZones) {
    suggestions.push({
      type: 'pressure_adjustment',
      content: `分区「${zoneName}」近期压力低于 ${LOW_PRESSURE_THRESHOLD} MPa，建议检查调压设备并调整压力输出`,
      priority: 'high'
    });
  }

  const avgFlow = overviews.length > 0
    ? overviews.reduce((a, b) => a + b.today.avg_flow, 0) / overviews.length
    : 0;

  if (avgFlow > 0) {
    const efficiencyTip = avgFlow > 120
      ? `当前系统平均流量较高（${Math.round(avgFlow)} m³/h），建议优化调度方案，采用错峰供水策略降低能耗`
      : `当前系统平均流量稳定（${Math.round(avgFlow)} m³/h），建议维持现有调度方案，持续监控压力变化`;

    suggestions.push({
      type: 'optimization',
      content: efficiencyTip,
      priority: 'low'
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'normal',
      content: '当前系统运行正常，所有分区预测流量均在安全范围内，建议保持现有调度方案',
      priority: 'low'
    });
  }

  const insertStmt = db.prepare(`
    INSERT INTO dispatch_suggestions (suggestion_type, content, priority, status)
    VALUES (?, ?, ?, 'pending')
  `);

  let lastSuggestionId = 0;

  const transaction = db.transaction(() => {
    for (const suggestion of suggestions) {
      const result = insertStmt.run(suggestion.type, suggestion.content, suggestion.priority);
      lastSuggestionId = result.lastInsertRowid as number;
    }
  });

  transaction();

  return { suggestionId: lastSuggestionId };
};

export const updateSuggestionStatus = (suggestionId: number, status: SuggestionStatus): void => {
  const db = getDb();

  const suggestionStmt = db.prepare('SELECT * FROM dispatch_suggestions WHERE id = ?');
  const suggestion = suggestionStmt.get(suggestionId) as DispatchSuggestion;

  if (!suggestion) {
    throw createError(404, '调度建议不存在');
  }

  const updateStmt = db.prepare(`
    UPDATE dispatch_suggestions
    SET status = ?
    WHERE id = ?
  `);

  updateStmt.run(status, suggestionId);
};

export const getZoneComparison = (
  startDate: string,
  endDate: string,
  holidayFactor: number = 1.0,
  weatherFactor: number = 1.0
) => {
  const db = getDb();

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw createError(400, '起始日期不能晚于截止日期');
  }

  const diffDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 30) {
    throw createError(400, '预测日期范围不能超过30天');
  }

  const zonesStmt = db.prepare('SELECT id, name FROM zones ORDER BY id');
  const zones = zonesStmt.all() as { id: number; name: string }[];

  const dates: string[] = [];
  for (let d = 0; d <= diffDays; d++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + d);
    dates.push(currentDate.toISOString().split('T')[0]);
  }

  const zoneSummaries: {
    zone_id: number;
    zone_name: string;
    date_summaries: {
      date: string;
      avg_flow: number;
      peak_flow: number;
      peak_hour: number;
      total_flow: number;
    }[];
    period_avg: number;
    period_peak: number;
    period_total: number;
  }[] = [];

  const lineChartData: {
    dates: string[];
    series: {
      zone_id: number;
      zone_name: string;
      hourly_flows: number[];
    }[];
  } = { dates: [], series: [] };

  for (const zone of zones) {
    const dateSummaries: {
      date: string;
      avg_flow: number;
      peak_flow: number;
      peak_hour: number;
      total_flow: number;
    }[] = [];

    const allHourlyFlows: number[] = [];
    const lineChartDates: string[] = [];

    for (const dateStr of dates) {
      const existing = db.prepare(`
        SELECT hour, forecast_flow FROM water_forecasts
        WHERE zone_id = ? AND forecast_date = ?
        ORDER BY hour
      `).all(zone.id, dateStr) as { hour: number; forecast_flow: number }[];

      let hourly: { hour: number; forecast_flow: number }[];
      if (existing.length === 24 && holidayFactor === 1.0 && weatherFactor === 1.0) {
        hourly = existing;
      } else {
        hourly = [];
        for (let hour = 0; hour < 24; hour++) {
          hourly.push({ hour, forecast_flow: generateForecastFlow(hour, 100, holidayFactor, weatherFactor) });
        }
      }

      const flows = hourly.map(h => h.forecast_flow);
      const avg = flows.length > 0 ? flows.reduce((a, b) => a + b, 0) / flows.length : 0;
      const peak = flows.length > 0 ? Math.max(...flows) : 0;
      const peakHour = flows.indexOf(peak);
      const total = flows.reduce((a, b) => a + b, 0);

      dateSummaries.push({
        date: dateStr,
        avg_flow: Math.round(avg * 100) / 100,
        peak_flow: Math.round(peak * 100) / 100,
        peak_hour: peakHour >= 0 ? peakHour : 0,
        total_flow: Math.round(total * 100) / 100
      });

      for (let h = 0; h < hourly.length; h++) {
        lineChartDates.push(`${dateStr} ${String(h).padStart(2, '0')}:00`);
        allHourlyFlows.push(Math.round(hourly[h].forecast_flow * 100) / 100);
      }
    }

    const periodFlows = dateSummaries.map(d => d.avg_flow);
    const periodPeaks = dateSummaries.map(d => d.peak_flow);
    const periodTotals = dateSummaries.map(d => d.total_flow);

    zoneSummaries.push({
      zone_id: zone.id,
      zone_name: zone.name,
      date_summaries: dateSummaries,
      period_avg: Math.round((periodFlows.reduce((a, b) => a + b, 0) / periodFlows.length) * 100) / 100,
      period_peak: Math.round(Math.max(...periodPeaks) * 100) / 100,
      period_total: Math.round(periodTotals.reduce((a, b) => a + b, 0) * 100) / 100
    });

    lineChartData.series.push({
      zone_id: zone.id,
      zone_name: zone.name,
      hourly_flows: allHourlyFlows
    });
  }

  lineChartData.dates = zones.length > 0 ? (() => {
    const arr: string[] = [];
    for (const dateStr of dates) {
      for (let h = 0; h < 24; h++) {
        arr.push(`${dateStr} ${String(h).padStart(2, '0')}:00`);
      }
    }
    return arr;
  })() : [];

  return {
    start_date: startDate,
    end_date: endDate,
    holiday_factor: holidayFactor,
    weather_factor: weatherFactor,
    zone_count: zones.length,
    zone_summaries: zoneSummaries,
    line_chart_data: lineChartData
  };
};

export const getPeakRiskRanking = (
  date?: string,
  holidayFactor: number = 1.0,
  weatherFactor: number = 1.0
) => {
  const db = getDb();
  const targetDate = date || new Date().toISOString().split('T')[0];
  const zonesStmt = db.prepare('SELECT id, name FROM zones ORDER BY id');
  const zones = zonesStmt.all() as { id: number; name: string }[];

  const PEAK_THRESHOLD_LOW = 120;
  const PEAK_THRESHOLD_MEDIUM = 150;
  const PEAK_THRESHOLD_HIGH = 180;

  const rankings: {
    zone_id: number;
    zone_name: string;
    peak_flow: number;
    risk_level: RiskLevel;
    risk_score: number;
    exceed_threshold: boolean;
    threshold: number;
    suggestion: string;
  }[] = [];

  for (const zone of zones) {
    const existing = db.prepare(`
      SELECT hour, forecast_flow FROM water_forecasts
      WHERE zone_id = ? AND forecast_date = ?
      ORDER BY hour
    `).all(zone.id, targetDate) as { hour: number; forecast_flow: number }[];

    let hourly: { hour: number; forecast_flow: number }[];
    if (existing.length === 24 && holidayFactor === 1.0 && weatherFactor === 1.0) {
      hourly = existing;
    } else {
      hourly = [];
      for (let hour = 0; hour < 24; hour++) {
        hourly.push({ hour, forecast_flow: generateForecastFlow(hour, 100, holidayFactor, weatherFactor) });
      }
    }

    const flows = hourly.map(h => h.forecast_flow);
    const peakFlow = flows.length > 0 ? Math.round(Math.max(...flows) * 100) / 100 : 0;

    let riskLevel: RiskLevel;
    let riskScore: number;
    let suggestion: string;

    if (peakFlow >= PEAK_THRESHOLD_HIGH) {
      riskLevel = 'critical';
      riskScore = 100;
      suggestion = `峰值 ${peakFlow} m³/h 超过高风险阈值，立即启动全部备用泵组并通知值班经理`;
    } else if (peakFlow >= PEAK_THRESHOLD_MEDIUM) {
      riskLevel = 'high';
      riskScore = 75;
      suggestion = `峰值 ${peakFlow} m³/h 较高，建议于早高峰前启动 1-2 台备用泵`;
    } else if (peakFlow >= PEAK_THRESHOLD_LOW) {
      riskLevel = 'medium';
      riskScore = 50;
      suggestion = `峰值 ${peakFlow} m³/h，建议关注压力变化并准备备用方案`;
    } else {
      riskLevel = 'low';
      riskScore = 25;
      suggestion = `峰值 ${peakFlow} m³/h，供水压力充足，维持现有方案即可`;
    }

    rankings.push({
      zone_id: zone.id,
      zone_name: zone.name,
      peak_flow: peakFlow,
      risk_level: riskLevel,
      risk_score: riskScore,
      exceed_threshold: peakFlow >= PEAK_THRESHOLD_MEDIUM,
      threshold: PEAK_THRESHOLD_MEDIUM,
      suggestion
    });
  }

  rankings.sort((a, b) => b.risk_score - a.risk_score);

  const counts = {
    critical: rankings.filter(r => r.risk_level === 'critical').length,
    high: rankings.filter(r => r.risk_level === 'high').length,
    medium: rankings.filter(r => r.risk_level === 'medium').length,
    low: rankings.filter(r => r.risk_level === 'low').length
  };

  const riskBarChart = {
    zone_names: rankings.map(r => r.zone_name),
    risk_scores: rankings.map(r => r.risk_score),
    risk_levels: rankings.map(r => r.risk_level)
  };

  return {
    date: targetDate,
    holiday_factor: holidayFactor,
    weather_factor: weatherFactor,
    ranking_list: rankings,
    risk_summary: counts,
    bar_chart_data: riskBarChart
  };
};
