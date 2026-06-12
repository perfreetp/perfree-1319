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

interface ForecastOverview {
  zone_id: number;
  zone_name: string;
  today_avg_flow: number;
  today_peak_flow: number;
  peak_hour: number;
  confidence: number;
}

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
  const today = new Date().toISOString().split('T')[0];

  const zonesStmt = db.prepare('SELECT id, name FROM zones ORDER BY id');
  const zones = zonesStmt.all() as { id: number; name: string }[];

  if (zones.length === 0) {
    return [];
  }

  const overviews: ForecastOverview[] = [];

  for (const zone of zones) {
    const forecasts = getZoneForecast(zone.id, today);

    if (forecasts.length > 0) {
      const flows = forecasts.map(f => f.forecast_flow);
      const avgFlow = flows.reduce((a, b) => a + b, 0) / flows.length;
      const peakFlow = Math.max(...flows);
      const peakHour = forecasts.find(f => f.forecast_flow === peakFlow)?.hour || 0;
      const confidence = forecasts[0].confidence;

      overviews.push({
        zone_id: zone.id,
        zone_name: zone.name,
        today_avg_flow: Math.round(avgFlow * 100) / 100,
        today_peak_flow: Math.round(peakFlow * 100) / 100,
        peak_hour: peakHour,
        confidence
      });
    }
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
  const today = new Date().toISOString().split('T')[0];

  const overviews = getAllForecastOverview();
  const suggestions: { type: string; content: string; priority: SuggestionPriority }[] = [];

  for (const overview of overviews) {
    if (overview.today_peak_flow > PEAK_FLOW_THRESHOLD) {
      suggestions.push({
        type: 'peak_warning',
        content: `分区「${overview.zone_name}」预测今日峰值流量 ${overview.today_peak_flow} m³/h 超过阈值 ${PEAK_FLOW_THRESHOLD} m³/h，建议于 ${overview.peak_hour}:00 前启动备用泵组`,
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
    ? overviews.reduce((a, b) => a + b.today_avg_flow, 0) / overviews.length
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
