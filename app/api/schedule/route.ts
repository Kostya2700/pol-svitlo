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

export async function GET() {
  try {
    const response = await fetch('https://www.poe.pl.ua/customs/dynamicgpv-info.php', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch schedule');
    }

    const html = await response.text();
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
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
