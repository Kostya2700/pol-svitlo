import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';

// ===== Інтерфейси =====
export interface TimeSlot {
  start: string;
  end: string;
  queues: number;
}

export interface QueueSchedule {
  queue: number;
  subqueue: number;
  hours: string[]; // класи для кожної півгодини доби
}

export interface ScheduleData {
  date: string;
  description: string;
  timeSlots: TimeSlot[];
  queueSchedules: QueueSchedule[];
  rawHtml: string;
}

// ===== Fallback дані на випадок недоступності серверу =====
function getFallbackData(): ScheduleData {
  const today = new Date();
  const dateStr =
    today.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }) + ' року';

  const createHoursPattern = (offPeriods: Array<{ start: number; end: number }>) =>
    Array(48)
      .fill('light_1')
      .map((_, i) => {
        for (const period of offPeriods) {
          if (i >= period.start && i < period.end) return 'light_2';
        }
        return 'light_1';
      });

  return {
    date: dateStr,
    description:
      '⚠️ Не вдалося завантажити актуальний графік з poe.pl.ua через тимчасові технічні проблеми. Відображаються приблизні дані. Будь ласка, перевірте офіційний сайт або спробуйте пізніше.',
    timeSlots: [
      { start: '00:00', end: '06:00', queues: 1 },
      { start: '06:00', end: '12:00', queues: 0.5 },
      { start: '12:00', end: '18:00', queues: 1 },
      { start: '18:00', end: '23:59', queues: 0.5 },
    ],
    queueSchedules: [
      { queue: 1, subqueue: 1, hours: createHoursPattern([{ start: 0, end: 12 }]) },
      { queue: 1, subqueue: 2, hours: createHoursPattern([{ start: 24, end: 36 }]) },
      { queue: 2, subqueue: 1, hours: createHoursPattern([{ start: 12, end: 24 }]) },
      { queue: 2, subqueue: 2, hours: createHoursPattern([{ start: 36, end: 48 }]) },
      { queue: 3, subqueue: 1, hours: createHoursPattern([{ start: 0, end: 12 }]) },
      { queue: 3, subqueue: 2, hours: createHoursPattern([{ start: 24, end: 36 }]) },
      { queue: 4, subqueue: 1, hours: createHoursPattern([{ start: 12, end: 24 }]) },
      { queue: 4, subqueue: 2, hours: createHoursPattern([{ start: 36, end: 48 }]) },
    ],
    rawHtml: '',
  };
}

// ===== Прямий запит без проксі =====
async function fetchDirect(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20 сек

    const response = await fetch('https://www.poe.pl.ua/customs/dynamicgpv-info.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PowerScheduleBot/1.0)',
        Accept: 'text/html',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 1000) {
      throw new Error('Empty or invalid HTML response');
    }

    return html;
  } catch (err) {
    console.error('[API] Direct fetch error:', err);
    throw err;
  }
}

// ===== Основна функція GET =====
export async function GET() {
  try {
    console.log('[API] Fetching schedule directly from poe.pl.ua');
    console.log('[API] Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
    console.log('[API] Vercel Region:', process.env.VERCEL_REGION || 'N/A');

    const html = await fetchDirect();
    console.log('[API] Successfully fetched HTML, length:', html.length);

    const $ = cheerio.load(html);

    // Дата
    const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4}\s+року)/);
    const date = dateMatch ? dateMatch[1] : '';

    // Опис
    const description = $('.gpvinfodetail').first().clone().children('div').remove().end().text().trim();

    // Часові проміжки
    const timeSlots: TimeSlot[] = [];
    const timeSlotRegex =
      /з\s+(\d{2}:\d{2})\s+по\s+(\d{2}:\d{2})[\s\S]*?в обсязі\s+<b>([\d.]+)<\/b>/g;
    let match;
    while ((match = timeSlotRegex.exec(html)) !== null) {
      timeSlots.push({
        start: match[1],
        end: match[2],
        queues: parseFloat(match[3]),
      });
    }

    // Графік відключень по чергах
    const queueSchedules: QueueSchedule[] = [];
    const rows = $('tbody tr');

    rows.each((_, row) => {
      const $row = $(row);
      const queueText = $row.find('.turnoff-scheduleui-table-queue').text().trim();
      const subqueueText = $row.find('.turnoff-scheduleui-table-subqueue').text().trim();

      if (queueText || subqueueText) {
        const queue =
          queueText !== '' ? parseInt(queueText) : queueSchedules.at(-1)?.queue || 0;
        const subqueue = subqueueText ? parseInt(subqueueText) : 0;

        const hours: string[] = [];
        $row.find('td').each((_, cell) => {
          const className = $(cell).attr('class') || '';
          if (className.includes('light_')) hours.push(className);
        });

        queueSchedules.push({ queue, subqueue, hours });
      }
    });

    const data: ScheduleData = {
      date,
      description,
      timeSlots,
      queueSchedules,
      rawHtml: html,
    };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching schedule:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const fallbackData = getFallbackData();
    fallbackData.description = `⚠️ Не вдалося завантажити актуальний графік з poe.pl.ua.\n\nПричина: ${errorMessage}\n\nВідображаються приблизні дані. Будь ласка, перевірте офіційний сайт: https://www.poe.pl.ua/`;

    return NextResponse.json(fallbackData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }
}
