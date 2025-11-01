import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

// Fallback дані на випадок недоступності серверу
function getFallbackData(): ScheduleData {
  const today = new Date();
  const dateStr = today.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) + ' року';

  // Створюємо графік з 48 півгодин (24 години * 2)
  const createHoursPattern = (offPeriods: Array<{ start: number; end: number }>) => {
    return Array(48).fill('light_1').map((_, i) => {
      for (const period of offPeriods) {
        if (i >= period.start && i < period.end) {
          return 'light_2';
        }
      }
      return 'light_1';
    });
  };

  return {
    date: dateStr,
    description: '⚠️ Не вдалося завантажити актуальний графік з poe.pl.ua через тимчасові технічні проблеми. Відображаються приблизні дані. Будь ласка, перевірте офіційний сайт або спробуйте пізніше.',
    timeSlots: [
      { start: '00:00', end: '06:00', queues: 1 },
      { start: '06:00', end: '12:00', queues: 0.5 },
      { start: '12:00', end: '18:00', queues: 1 },
      { start: '18:00', end: '23:59', queues: 0.5 },
    ],
    queueSchedules: [
      {
        queue: 1,
        subqueue: 1,
        hours: createHoursPattern([{ start: 0, end: 12 }]), // 00:00-06:00
      },
      {
        queue: 1,
        subqueue: 2,
        hours: createHoursPattern([{ start: 24, end: 36 }]), // 12:00-18:00
      },
      {
        queue: 2,
        subqueue: 1,
        hours: createHoursPattern([{ start: 12, end: 24 }]), // 06:00-12:00
      },
      {
        queue: 2,
        subqueue: 2,
        hours: createHoursPattern([{ start: 36, end: 48 }]), // 18:00-24:00
      },
      {
        queue: 3,
        subqueue: 1,
        hours: createHoursPattern([{ start: 0, end: 12 }]),
      },
      {
        queue: 3,
        subqueue: 2,
        hours: createHoursPattern([{ start: 24, end: 36 }]),
      },
      {
        queue: 4,
        subqueue: 1,
        hours: createHoursPattern([{ start: 12, end: 24 }]),
      },
      {
        queue: 4,
        subqueue: 2,
        hours: createHoursPattern([{ start: 36, end: 48 }]),
      },
    ],
    rawHtml: '',
  };
}

async function fetchWithFallback(url: string, options: RequestInit, signal: AbortSignal) {
  // Спроба 1: Прямий запит
  try {
    console.log('[API] Trying direct fetch...');
    const response = await fetch(url, { ...options, signal });
    if (response.ok) {
      console.log('[API] Direct fetch successful');
      return response;
    }
    console.log('[API] Direct fetch failed with status:', response.status);
  } catch (err) {
    console.log('[API] Direct fetch error:', err instanceof Error ? err.message : 'Unknown');
  }

  // Спроба 2: Через allorigins.win
  try {
    console.log('[API] Trying allorigins.win proxy...');
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, { signal });
    if (response.ok) {
      console.log('[API] allorigins.win proxy successful');
      return response;
    }
    console.log('[API] allorigins.win proxy failed with status:', response.status);
  } catch (err) {
    console.log('[API] allorigins.win proxy error:', err instanceof Error ? err.message : 'Unknown');
  }

  // Спроба 3: Через corsproxy.io
  try {
    console.log('[API] Trying corsproxy.io proxy...');
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, { signal });
    if (response.ok) {
      console.log('[API] corsproxy.io proxy successful');
      return response;
    }
    console.log('[API] corsproxy.io proxy failed with status:', response.status);
  } catch (err) {
    console.log('[API] corsproxy.io proxy error:', err instanceof Error ? err.message : 'Unknown');
  }

  throw new Error('All fetch attempts failed (direct + 2 proxies)');
}

export async function GET() {
  try {
    console.log('[API] Fetching schedule from poe.pl.ua');
    console.log('[API] Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
    console.log('[API] Vercel Region:', process.env.VERCEL_REGION || 'N/A');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 секунд для всіх спроб

    const url = 'https://www.poe.pl.ua/customs/dynamicgpv-info.php';
    const options: RequestInit = {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
      },
    };

    const response = await fetchWithFallback(url, options, controller.signal);
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[API] Fetch failed with status:', response.status);
      throw new Error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log('[API] Successfully fetched HTML, length:', html.length);
    const $ = cheerio.load(html);

    // Витягуємо дату
    const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4}\s+року)/);
    const date = dateMatch ? dateMatch[1] : '';

    // Витягуємо опис та часові проміжки
    const description = $('.gpvinfodetail').first().clone().children('div').remove().end().text().trim();

    const timeSlots: TimeSlot[] = [];
    const timeSlotRegex = /з\s+(\d{2}:\d{2})\s+по\s+(\d{2}:\d{2})[\s\S]*?в обсязі\s+<b>([\d.]+)<\/b>/g;
    let match;

    while ((match = timeSlotRegex.exec(html)) !== null) {
      timeSlots.push({
        start: match[1],
        end: match[2],
        queues: parseFloat(match[3]),
      });
    }

    // Витягуємо графік відключень по чергах
    const queueSchedules: QueueSchedule[] = [];
    const rows = $('tbody tr');

    rows.each((_, row) => {
      const $row = $(row);
      const queueText = $row.find('.turnoff-scheduleui-table-queue').text().trim();
      const subqueueText = $row.find('.turnoff-scheduleui-table-subqueue').text().trim();

      if (queueText || subqueueText) {
        const queue = queueText ? parseInt(queueText) : queueSchedules[queueSchedules.length - 1]?.queue || 0;
        const subqueue = subqueueText ? parseInt(subqueueText) : 0;

        const hours: string[] = [];
        $row.find('td').each((index, cell) => {
          const className = $(cell).attr('class') || '';
          if (className.includes('light_')) {
            hours.push(className);
          }
        });

        queueSchedules.push({
          queue,
          subqueue,
          hours,
        });
      }
    });

    const data: ScheduleData = {
      date,
      description,
      timeSlots,
      queueSchedules,
      rawHtml: html,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error fetching schedule:', error);

    // Детальне логування помилки
    if (error instanceof Error) {
      console.error('[API] Error name:', error.name);
      console.error('[API] Error message:', error.message);
      console.error('[API] Error stack:', error.stack);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Якщо основний запит не вдався, повертаємо fallback дані
    console.log('[API] Returning fallback data due to error:', errorMessage);
    const fallbackData = getFallbackData();

    // Додаємо інформацію про помилку в fallback дані
    fallbackData.description = `⚠️ Не вдалося завантажити актуальний графік з poe.pl.ua.\n\nПричина: ${errorMessage}\n\nВідображаються приблизні дані. Будь ласка, перевірте офіційний сайт: https://www.poe.pl.ua/`;

    return NextResponse.json(fallbackData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  }
}
