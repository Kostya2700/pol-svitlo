'use client';

import { useEffect, useState } from 'react';
import type { ScheduleData } from '../api/schedule/route';

export default function PowerSchedule() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/schedule');
      if (!response.ok) throw new Error('Failed to fetch schedule');
      const data = await response.json();

      // Перевіряємо чи змінився графік
      if (schedule && JSON.stringify(schedule.queueSchedules) !== JSON.stringify(data.queueSchedules)) {
        // Графік змінився - надсилаємо повідомлення
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Графік відключень змінився!', {
            body: 'Перевірте новий графік відключень електроенергії',
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
          });
        }
      }

      setSchedule(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
    // Оновлюємо кожні 10 хвилин
    const interval = setInterval(fetchSchedule, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('Сповіщення увімкнені! ✅', {
          body: 'Тепер ви отримуватимете повідомлення про зміни графіка',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
        });
      }
    }
  };

  const testNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Тестове сповіщення ✅', {
        body: 'Якщо ви це бачите - сповіщення працюють правильно!',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
      });

      // Вібрація для мобільних (якщо підтримується)
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }

      // Автоматично закрити через 5 секунд
      setTimeout(() => notification.close(), 5000);
    } else if ('Notification' in window && Notification.permission === 'default') {
      alert('Спочатку натисніть кнопку "🔔 Увімкнути сповіщення"');
    } else {
      alert('Сповіщення заблоковані. Дозвольте їх у налаштуваннях браузера.');
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

  const getCurrentHour = () => new Date().getHours();

  if (loading && !schedule) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Завантаження графіка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl text-red-500">Помилка: {error}</div>
      </div>
    );
  }

  if (!schedule) return null;

  const currentHour = getCurrentHour();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-2 sm:px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Заголовок */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-gray-800 text-center sm:text-left">
            ⚡ Графік відключень електроенергії
          </h1>
          <div className="bg-white border-l-4 border-blue-500 p-3 sm:p-4 rounded-lg shadow-md mb-3 sm:mb-4">
            <p className="text-base sm:text-lg font-semibold text-gray-800 mb-2">{schedule.date}</p>
            <p className="text-sm sm:text-base text-gray-600 whitespace-pre-wrap">{schedule.description}</p>
          </div>

          <div className="flex gap-2 sm:gap-4 mb-3 sm:mb-4 flex-col sm:flex-row">
            <button
              onClick={requestNotificationPermission}
              className="bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition shadow-md font-medium text-sm sm:text-base"
            >
              🔔 Увімкнути сповіщення
            </button>
            <button
              onClick={fetchSchedule}
              className="bg-green-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-green-700 transition shadow-md font-medium text-sm sm:text-base"
            >
              🔄 Оновити зараз
            </button>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 text-center sm:text-left bg-white px-3 py-2 rounded-lg shadow-sm">
            Останнє оновлення: {lastUpdate.toLocaleTimeString('uk-UA')}
          </p>
        </div>

        {/* Часові проміжки */}
        <div className="mb-4 sm:mb-6 bg-white p-3 sm:p-4 rounded-lg shadow-md">
          <h2 className="text-lg sm:text-xl font-bold mb-3 text-gray-800 flex items-center gap-2">
            <span className="text-2xl">📊</span> Обсяг відключень
          </h2>
          <div className="space-y-2">
            {schedule.timeSlots.map((slot, index) => (
              <div key={index} className="flex items-center gap-2 sm:gap-3 bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                <span className="font-mono font-bold text-sm sm:text-base min-w-[100px] sm:min-w-[120px] text-gray-700">
                  {slot.start} - {slot.end}
                </span>
                <span className="bg-orange-500 text-white px-2 sm:px-3 py-1 rounded-lg font-semibold text-xs sm:text-sm shadow-sm">
                  {slot.queues} {slot.queues === 1 ? 'черга' : slot.queues < 2 ? 'черги' : 'черг'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Легенда */}
        <div className="mb-4 bg-white p-3 sm:p-4 rounded-lg shadow-md">
          <h3 className="text-base sm:text-lg font-bold mb-3 text-gray-800">Позначення:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 bg-green-50 p-2 sm:p-3 rounded-lg border-2 border-green-600">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-600 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Світло</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-red-50 p-2 sm:p-3 rounded-lg border-2 border-red-600">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-600 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Відключено</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-yellow-50 p-2 sm:p-3 rounded-lg border-2 border-yellow-500">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-500 rounded shadow-md"></div>
              <span className="font-semibold text-sm sm:text-base text-gray-800">Можливе відключення</span>
            </div>
          </div>
        </div>

        {/* Графік по годинах */}
        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-md">
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800 flex items-center gap-2 px-2">
            <span className="text-2xl">📅</span> Графік по чергах
          </h2>

          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <div className="min-w-[800px] px-2">
              {schedule.queueSchedules.map((qs, qsIndex) => (
                <div key={qsIndex} className="mb-4 sm:mb-6 bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                  <div className="font-bold text-base sm:text-lg mb-2 sm:mb-3 text-gray-800 bg-white px-3 py-2 rounded-lg shadow-sm border-l-4 border-blue-500">
                    Черга {qs.queue}.{qs.subqueue}
                  </div>
                  <div className="grid grid-cols-24 gap-0.5 sm:gap-1">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const isCurrentHour = hour === currentHour;
                      return (
                        <div key={hour} className="space-y-0.5 sm:space-y-1">
                          <div className={`text-[10px] sm:text-xs text-center font-bold mb-1 px-0.5 py-0.5 rounded ${
                            isCurrentHour ? 'bg-blue-600 text-white' : 'text-gray-700'
                          }`}>
                            {hour.toString().padStart(2, '0')}
                          </div>
                          <div className="flex flex-col gap-0.5 sm:gap-1">
                            {[0, 1].map((halfHour) => {
                              const idx = hour * 2 + halfHour;
                              const className = qs.hours[idx] || '';
                              const time = `${hour.toString().padStart(2, '0')}:${(halfHour * 30).toString().padStart(2, '0')}`;
                              return (
                                <div
                                  key={halfHour}
                                  className={`w-full h-6 sm:h-8 rounded ${getStatusColor(className)} ${
                                    isCurrentHour ? 'ring-2 ring-blue-500' : ''
                                  } hover:scale-110 transition-transform cursor-pointer shadow-sm`}
                                  title={`${time} - ${getStatusText(className)}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs sm:text-sm text-gray-600 text-center bg-blue-50 p-2 sm:p-3 rounded-lg">
            💡 Підказка: Проведіть пальцем по графіку, щоб побачити час і статус. Поточна година виділена синім.
          </div>
        </div>

        {/* Тестова кнопка для сповіщень */}
        <div className="mt-4 sm:mt-6 bg-white p-3 sm:p-4 rounded-lg shadow-md border-2 border-purple-200">
          <h3 className="text-base sm:text-lg font-bold mb-2 text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🧪</span> Перевірка сповіщень
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-3">
            Натисніть кнопку нижче, щоб перевірити чи працюють сповіщення на вашому пристрої
          </p>
          <button
            onClick={testNotification}
            className="w-full bg-purple-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-purple-700 transition shadow-md font-medium text-sm sm:text-base"
          >
            🔔 Надіслати тестове сповіщення
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Спочатку увімкніть сповіщення кнопкою вище ↑
          </p>
        </div>
      </div>
    </div>
  );
}
