'use client';

import { useEffect, useState } from 'react';

// Типи
interface TimeSlot {
  start: string;
  end: string;
  queues: number;
}

interface QueueSchedule {
  queue: number;
  subqueue: string;
  hours: string[];
}

interface ScheduleData {
  date: string;
  description: string;
  timeSlots: TimeSlot[];
  queueSchedules: QueueSchedule[];
}

// Парсер HTML → ScheduleData
function parseHtml(html: string): ScheduleData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const date = doc.querySelector('h2')?.textContent?.trim() || 'Невідома дата';
  const description = doc.querySelector('p')?.textContent?.trim() || '';

  const tableRows = Array.from(doc.querySelectorAll('table tr'));
  const queueSchedules: QueueSchedule[] = [];

  tableRows.forEach((row, i) => {
    const cells = row.querySelectorAll('td');
    if (cells.length > 0) {
      const queue = i + 1;
      const subqueue = '';
      const hours = Array.from(cells).map((cell) => cell.className || '');
      queueSchedules.push({ queue, subqueue, hours });
    }
  });

  const timeSlots = Array.from({ length: 24 }, (_, i) => ({
    start: `${i.toString().padStart(2, '0')}:00`,
    end: `${(i + 1).toString().padStart(2, '0')}:00`,
    queues: Math.floor(Math.random() * 3) + 1, // фіктивні черги, бо у вихідному HTML їх нема
  }));

  return { date, description, timeSlots, queueSchedules };
}

export default function PowerSchedule() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied'>('default');

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
      console.error('Помилка при відтворенні звуку:', err);
    }
  };

  const fetchSchedule = async () => {
    try {
      setLoading(true);

      const response = await fetch('https://www.poe.pl.ua/customs/dynamicgpv-info.php', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html',
        },
        mode: 'cors',
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const html = await response.text();
      const data = parseHtml(html);

      if (
        schedule &&
        JSON.stringify(schedule.queueSchedules) !== JSON.stringify(data.queueSchedules)
      ) {
        if ('Notification' in window && Notification.permission === 'granted') {
          playNotificationSound();
          new Notification('⚡ Графік відключень змінився!', {
            body: 'Перевірте новий графік у додатку',
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
          });
        }
      }

      setSchedule(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Помилка при завантаженні графіка:', err);
      setError(err instanceof Error ? err.message : 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 10 * 60 * 1000); // кожні 10 хв
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission as 'default' | 'granted' | 'denied');
    }
    return () => clearInterval(interval);
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Ваш браузер не підтримує сповіщення');
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission as 'default' | 'granted' | 'denied');
      if (permission === 'granted') {
        playNotificationSound();
        new Notification('✅ Сповіщення увімкнені!', {
          body: 'Тепер ви отримаєте повідомлення при зміні графіка',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
        });
      }
    }
  };

  const testNotification = async () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      playNotificationSound();
      new Notification('🧪 Тестове сповіщення', {
        body: 'Якщо ви бачите це повідомлення — все працює!',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
      });
    } else {
      alert('Спочатку дозвольте сповіщення');
    }
  };

  const getStatusColor = (className: string) => {
    if (className.includes('light_1')) return 'bg-green-600';
    if (className.includes('light_2')) return 'bg-red-600';
    if (className.includes('light_3')) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getStatusText = (className: string) => {
    if (className.includes('light_1')) return 'Світло';
    if (className.includes('light_2')) return 'Відключено';
    if (className.includes('light_3')) return 'Можливе відключення';
    return '';
  };

  const currentHour = new Date().getHours();

  if (loading && !schedule) return <div className="p-4 text-center">Завантаження...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Помилка: {error}</div>;
  if (!schedule) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-2 sm:px-4">
      <div className="container mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold text-center mb-4">⚡ Графік відключень</h1>

        <div className="flex gap-2 mb-4 justify-center flex-wrap">
          <button
            onClick={requestNotificationPermission}
            className={`px-4 py-2 rounded-lg text-white ${
              notificationStatus === 'granted'
                ? 'bg-green-600'
                : notificationStatus === 'denied'
                ? 'bg-red-600'
                : 'bg-blue-600'
            }`}
          >
            {notificationStatus === 'granted'
              ? '✅ Сповіщення увімкнені'
              : '🔔 Увімкнути сповіщення'}
          </button>

          <button
            onClick={fetchSchedule}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            {loading ? '⏳ Оновлення...' : '🔄 Оновити зараз'}
          </button>
        </div>

        <p className="text-sm text-gray-600 text-center mb-6">
          Останнє оновлення: {lastUpdate.toLocaleTimeString('uk-UA')}
        </p>

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">{schedule.date}</h2>
          <p className="text-gray-700">{schedule.description}</p>
        </div>

        {schedule.queueSchedules.map((qs, i) => (
          <div key={i} className="mb-6 bg-white rounded-xl shadow p-3">
            <h3 className="font-bold text-lg mb-2">Черга {qs.queue}</h3>
            <div className="grid grid-cols-24 gap-0.5">
              {Array.from({ length: 24 }, (_, hour) => {
                const isCurrentHour = hour === currentHour;
                return (
                  <div key={hour}>
                    <div
                      className={`text-[10px] text-center ${
                        isCurrentHour ? 'bg-blue-600 text-white' : 'text-gray-700'
                      }`}
                    >
                      {hour.toString().padStart(2, '0')}
                    </div>
                    {[0, 1].map((halfHour) => {
                      const idx = hour * 2 + halfHour;
                      const className = qs.hours[idx] || '';
                      const time = `${hour.toString().padStart(2, '0')}:${(halfHour * 30)
                        .toString()
                        .padStart(2, '0')}`;
                      return (
                        <div
                          key={halfHour}
                          className={`w-full h-6 rounded ${getStatusColor(className)} ${
                            isCurrentHour ? 'ring-2 ring-blue-500' : ''
                          }`}
                          title={`${time} - ${getStatusText(className)}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="text-center mt-4">
          <button
            onClick={testNotification}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            🧪 Надіслати тестове сповіщення
          </button>
        </div>
      </div>
    </div>
  );
}
